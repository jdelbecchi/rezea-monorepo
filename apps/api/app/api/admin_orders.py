"""
API admin pour la gestion des commandes
"""
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.db.session import get_db
from app.models.models import User, UserRole, Order, Offer, Booking, BookingStatus, OrderPaymentStatus, Installment
from app.schemas.schemas import OrderCreate, OrderUpdate, OrderResponse, InstallmentResponse
from app.services import orders as order_service

router = APIRouter()


# ---- Auth dependency ----
async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = getattr(request.state, "user_id", None)
    tenant_id = getattr(request.state, "tenant_id", None)
    
    if not user_id or not tenant_id:
        # Tenter de récupérer l'erreur depuis le middleware s'il y en a une logguée
        print(f"DEBUG: require_manager failed - user_id: {user_id}, tenant_id: {tenant_id}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expirée ou invalide. Veuillez vous reconnecter."
        )
        
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux managers"
        )
    return user


# (Removed: compute_end_date, normalize_status, compute_credits_used, build_order_response - now in order_service)


def generate_installments(order: Order, tenant_id) -> List[Installment]:
    """Génère les échéances pour une commande échelonnée"""
    installments = []
    
    # On utilise les données de la commande (qui sont copiées de l'offre au départ)
    price = order.price_recurring_cents
    count = order.recurring_count

    # Si pas de prix récurrent, rien à faire
    if not price:
        return installments

    # Si pas de nombre d'occurrences (abonnement), on génère par défaut 12 mois
    if count is None:
        count = 12

    for i in range(count):
        # Date d'anniversaire : le 8 du mois, à partir du mois suivant la commande
        due_date = order.start_date + relativedelta(months=i + 1)
        due_date = due_date.replace(day=8)

        installments.append(Installment(
            tenant_id=tenant_id,
            order_id=order.id,
            due_date=due_date,
            amount_cents=price,
            is_paid=False,  # Pas pointé par défaut
            is_error=False, # Pas d'erreur par défaut
        ))

    return installments


# ---- LIST ----
@router.get("", response_model=List[OrderResponse])
async def list_orders(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Order)
        .where(Order.tenant_id == tenant_id)
        .options(joinedload(Order.user), joinedload(Order.offer), selectinload(Order.installments))
        .order_by(Order.created_at.desc())
    )
    orders = result.unique().scalars().all()

    responses = []
    for order in orders:
        credits_used = await order_service.compute_credits_used(
            db, order.user_id, order.tenant_id, order.start_date, order.end_date
        )
        responses.append(order_service.build_order_response(order, credits_used))

    return responses


# ---- STATUSES LIST ----
@router.get("/statuses", response_model=List[str])
async def list_order_statuses(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Renvoie la liste unique des statuts existants pour le tenant"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Order.status)
        .where(Order.tenant_id == tenant_id, Order.status != None)
        .distinct()
    )
    distinct_rows = result.all()
    normalized = set()
    for row in distinct_rows:
        norm = order_service.normalize_status(row[0])
        if norm:
            normalized.add(norm)
            
    base_statuses = ["active", "termine", "expiree", "en_pause", "resiliee"]
    manual_statuses = sorted([s for s in normalized if s not in base_statuses])
    
    return base_statuses + manual_statuses


# ---- CREATE ----
@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    request: Request,
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id

    # Vérifier que l'utilisateur existe dans le tenant
    user_result = await db.execute(
        select(User).where(User.id == data.user_id, User.tenant_id == tenant_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Vérifier que l'offre existe dans le tenant
    offer_result = await db.execute(
        select(Offer).where(Offer.id == data.offer_id, Offer.tenant_id == tenant_id)
    )
    offer = offer_result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offre non trouvée")

    end_date = order_service.compute_end_date(offer, data.start_date)
    
    # Initial status calculation logic
    today = date.today()
    is_past = not offer.is_validity_unlimited and end_date and end_date < today
    has_credits = offer.is_unlimited or (offer.classes_included is not None and offer.classes_included > 0)
    
    if not has_credits:
        initial_status = "termine"
    elif is_past:
        initial_status = "expiree"
    else:
        initial_status = "active"

    # Determine price and payment status
    price = offer.price_lump_sum_cents or offer.price_recurring_cents or 0
    # Force WAITING status for admin-created orders
    payment_status = OrderPaymentStatus.WAITING

    order = Order(
        tenant_id=tenant_id,
        user_id=data.user_id,
        offer_id=data.offer_id,
        start_date=data.start_date,
        end_date=end_date,
        is_validity_unlimited=offer.is_validity_unlimited,
        credits_total=offer.classes_included,
        is_unlimited=offer.is_unlimited,
        price_cents=price,
        price_recurring_cents=offer.price_recurring_cents,
        recurring_count=offer.recurring_count,
        featured_pricing=offer.featured_pricing,
        period=offer.period,
        payment_status=payment_status,
        comment=data.comment,
        user_note=data.user_note,
        status=order_service.normalize_status(initial_status),
        created_by_admin=True,
    )
    db.add(order)
    await db.flush()  # Get order.id before generating installments

    # Note: Installments are now only generated when moving to INSTALLMENT status in update_order

    await db.commit()
    await db.refresh(order)

    # Reload with relations
    result = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(joinedload(Order.user), joinedload(Order.offer), joinedload(Order.installments))
    )
    order = result.unique().scalar_one()

    credits_used = await order_service.compute_credits_used(
        db, order.user_id, order.tenant_id, order.start_date, order.end_date
    )
    return order_service.build_order_response(order, credits_used)


# ---- UPDATE ----
@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    request: Request,
    data: OrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.tenant_id == tenant_id)
        .options(joinedload(Order.user), joinedload(Order.offer), joinedload(Order.installments))
    )
    order = result.unique().scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")

    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = order_service.normalize_status(update_data["status"])
        
    for field, value in update_data.items():
        setattr(order, field, value)

    # Transition to INSTALLMENT: generate installments if they don't exist
    payment_is_installment = order.payment_status == OrderPaymentStatus.INSTALLMENT
    
    # Si on vient de passer en échelonné OU si on l'était déjà mais que les tarifs ont changé
    pricing_changed = "price_recurring_cents" in update_data or "recurring_count" in update_data or "featured_pricing" in update_data
    
    if payment_is_installment:
        # Check if installments already exist
        check_result = await db.execute(select(Installment).where(Installment.order_id == order.id))
        existing_installments = check_result.scalars().all()
        
        if not existing_installments:
            # Création initiale
            installments = generate_installments(order, tenant_id)
            for inst in installments:
                db.add(inst)
        elif pricing_changed:
            # Si le tarif a changé, on ne régénère que si AUCUNE échéance n'est encore payée ou en erreur
            # (pour éviter de casser l'historique financier)
            can_regenerate = all(not inst.is_paid and not inst.is_error for inst in existing_installments)
            if can_regenerate:
                # Supprimer les anciennes et recréer
                for inst in existing_installments:
                    await db.delete(inst)
                await db.flush()
                
                new_installments = generate_installments(order, tenant_id)
                for inst in new_installments:
                    db.add(inst)

    await db.commit()
    await db.refresh(order)

    # Reload with relations
    result = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(joinedload(Order.user), joinedload(Order.offer), joinedload(Order.installments))
    )
    order = result.unique().scalar_one()

    credits_used = await order_service.compute_credits_used(
        db, order.user_id, order.tenant_id, order.start_date, order.end_date
    )
    return order_service.build_order_response(order, credits_used)


# ---- DELETE ----
@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")

    await db.delete(order)
    await db.commit()


# ---- INSTALLMENTS ----
@router.get("/{order_id}/installments", response_model=List[InstallmentResponse])
async def list_installments(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste les échéances d'une commande"""
    tenant_id = request.state.tenant_id
    
    # Vérifier que la commande existe
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    if not order_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    result = await db.execute(
        select(Installment)
        .where(Installment.order_id == order_id, Installment.tenant_id == tenant_id)
        .order_by(Installment.due_date)
    )
    return result.scalars().all()


@router.patch("/{order_id}/installments/{installment_id}/error")
async def mark_installment_error(
    order_id: str,
    installment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Signaler un impayé sur une échéance"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Installment).where(
            Installment.id == installment_id,
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id
        )
    )
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    
    inst.is_error = True
    inst.is_paid = False
    inst.marked_error_at = datetime.utcnow()
    inst.resolved_at = None
    
    # Update order payment status to a_regulariser
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = order_result.scalar_one()
    order.payment_status = OrderPaymentStatus.ISSUE
    
    await db.commit()
    return {"status": "ok", "message": "Échéance marquée en erreur"}


@router.patch("/{order_id}/installments/{installment_id}/resolve")
async def resolve_installment(
    order_id: str,
    installment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Régulariser une échéance"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Installment).where(
            Installment.id == installment_id,
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id
        )
    )
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    
    inst.is_error = False
    inst.is_paid = True # Regulated = manually paid
    inst.resolved_at = datetime.utcnow()
    
    await db.flush()
    
    # Check if any errors remain -> if not, revert order to echelonne
    error_result = await db.execute(
        select(func.count(Installment.id)).where(
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id,
            Installment.is_error == True
        )
    )
    error_count = error_result.scalar()
    
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = order_result.scalar_one()
    
    # If no more errors, revert to echelonne
    if error_count == 0:
        order.payment_status = OrderPaymentStatus.INSTALLMENT
    
    await db.commit()
    return {"status": "ok", "message": "Échéance régularisée"}


@router.patch("/{order_id}/installments/{installment_id}/pay")
async def pay_installment(
    order_id: str,
    installment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Marquer une échéance comme payée manuellement (espèces, chèque, etc.)"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Installment).where(
            Installment.id == installment_id,
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id
        )
    )
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    
    inst.is_paid = True
    inst.is_error = False
    inst.resolved_at = datetime.utcnow()
    
    await db.flush()
    
    # Vérifier s'il reste des erreurs sur cette commande
    error_result = await db.execute(
        select(func.count(Installment.id)).where(
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id,
            Installment.is_error == True
        )
    )
    error_count = error_result.scalar()
    
    # Si plus d'erreurs, remettre la commande en "echelonne" si elle était en "a_regulariser"
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = order_result.scalar_one()
    if error_count == 0 and order.payment_status == OrderPaymentStatus.ISSUE:
        order.payment_status = OrderPaymentStatus.INSTALLMENT
    
    await db.commit()
    return {"status": "ok", "message": "Échéance marquée comme payée"}


@router.patch("/{order_id}/installments/{installment_id}/reset")
async def reset_installment(
    order_id: str,
    installment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Remettre une échéance à l'état 'À venir' (non payée, pas d'erreur)"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Installment).where(
            Installment.id == installment_id,
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id
        )
    )
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    
    inst.is_paid = False
    inst.is_error = False
    inst.resolved_at = None
    inst.marked_error_at = None
    
    await db.flush()
    
    # Vérifier s'il reste des erreurs sur cette commande pour mettre à jour le statut global
    error_result = await db.execute(
        select(func.count(Installment.id)).where(
            Installment.order_id == order_id,
            Installment.tenant_id == tenant_id,
            Installment.is_error == True
        )
    )
    error_count = error_result.scalar()
    
    order_result = await db.execute(
        select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
    )
    order = order_result.scalar_one()
    if error_count == 0 and order.payment_status == OrderPaymentStatus.ISSUE:
        order.payment_status = OrderPaymentStatus.INSTALLMENT
    
    await db.commit()
    return {"status": "ok", "message": "Échéance remise à l'état initial"}


# ---- SUSPEND USER CREDITS ----
@router.patch("/users/{user_id}/suspend")
async def toggle_suspend_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Suspendre/réactiver les crédits d'un utilisateur"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    user.is_suspended = not user.is_suspended
    await db.commit()
    
    return {"status": "ok", "is_suspended": user.is_suspended}
