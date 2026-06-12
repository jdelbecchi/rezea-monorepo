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
from app.models.models import (
    User, UserRole, Order, Offer, Booking, BookingStatus, OrderPaymentStatus, 
    Installment, CreditAccount, FinanceTransaction, FinanceTransactionType, 
    FinanceCategory, FinancePaymentMethod, Tenant
)
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
    """Génère les échéances pour une commande échelonnée.
    
    - 1ère échéance : à la date de début de la commande (paiement immédiat requis)
    - Échéances suivantes : le 8 de chaque mois suivant
    """
    installments = []
    
    price = order.price_recurring_cents
    count = order.recurring_count

    if not price:
        return installments

    if count is None:
        count = 12

    for i in range(count):
        if i == 0:
            # 1ère échéance : date de début de la commande
            due_date = order.start_date
        else:
            # Échéances suivantes : le 8 du mois suivant (i mois après le début)
            due_date = order.start_date + relativedelta(months=i)
            due_date = due_date.replace(day=8)

        installments.append(Installment(
            tenant_id=tenant_id,
            order_id=order.id,
            due_date=due_date,
            amount_cents=price,
            is_paid=False,
            is_error=False,
        ))

    return installments


async def _record_finance_income(db: AsyncSession, tenant_id: str, amount_cents: int, description: str, order_id: Optional[str] = None):
    """Enregistre une recette dans la trésorerie"""
    cat_query = select(FinanceCategory).where(
        FinanceCategory.tenant_id == tenant_id,
        FinanceCategory.name == "Ventes Offres"
    )
    cat_res = await db.execute(cat_query)
    cat = cat_res.scalar_one_or_none()
    
    # Tenter d'enrichir la description si on a un order_id
    full_description = description
    if order_id:
        try:
            # On importe ici pour éviter les imports circulaires
            from app.models.models import Order, User, Offer
            order_res = await db.execute(
                select(Order)
                .options(joinedload(Order.user), joinedload(Order.offer))
                .where(Order.id == order_id)
            )
            order = order_res.scalar_one_or_none()
            if order and order.user and order.offer:
                full_description = f"Paiement commande {order.offer.name} - {order.user.first_name} {order.user.last_name}"
        except Exception:
            pass # Fallback à la description de base si erreur

    tx = FinanceTransaction(
        tenant_id=tenant_id,
        date=date.today(),
        type=FinanceTransactionType.INCOME,
        category_id=cat.id if cat else None,
        amount_cents=amount_cents,
        description=full_description,
        order_id=order_id,
        is_reconciled=True
    )
    db.add(tx)


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

    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"

    fifo_cache = {}
    responses = []
    for order in orders:
        u_id = str(order.user_id)
        if u_id not in fifo_cache:
            fifo_cache[u_id] = await order_service.compute_fifo_balances(db, order.user_id, tenant_id)
            
        user_fifo_balances, _, _ = fifo_cache[u_id]
        order_fifo = user_fifo_balances.get(str(order.id), {})
        order_balance = order_fifo.get("balance")
        order_used = order_fifo.get("credits_used", 0)
        is_blocked = order_fifo.get("is_blocked", False)
        
        responses.append(order_service.build_order_response(
            order, 
            credits_used=order_used, 
            global_balance=order_balance,
            global_credits_used=order_used,
            grace_period_days=grace_days,
            grace_period_mode=grace_mode,
            is_blocked_val=is_blocked
        ))

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

    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"

    end_date = order_service.compute_end_date(offer, data.start_date)
    
    # Initial status calculation logic
    today = date.today()
    effective_end = order_service.compute_effective_end_date(end_date, grace_days, grace_mode)
    is_past = not offer.is_validity_unlimited and effective_end and effective_end < today
    has_credits = offer.is_unlimited or (offer.classes_included is not None and offer.classes_included > 0)
    
    if not has_credits:
        initial_status = "termine"
    elif is_past:
        initial_status = "expiree"
    else:
        initial_status = "active"

    # Determine price and payment status
    price = offer.price_lump_sum_cents or offer.price_recurring_cents or 0
    # Force WAITING status for admin-created orders, unless price is 0 (free)
    payment_status = OrderPaymentStatus.PAID if price == 0 else OrderPaymentStatus.WAITING

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

    # Get FIFO balances
    user_fifo_balances, _, _ = await order_service.compute_fifo_balances(db, order.user_id, tenant_id)
    order_fifo = user_fifo_balances.get(str(order.id), {})
    order_balance = order_fifo.get("balance")
    order_used = order_fifo.get("credits_used", 0)
    is_blocked = order_fifo.get("is_blocked", False)

    return order_service.build_order_response(
        order, 
        credits_used=order_used,
        global_balance=order_balance,
        global_credits_used=order_used,
        grace_period_days=grace_days,
        grace_period_mode=grace_mode,
        is_blocked_val=is_blocked
    )


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
        
    # Logic for treasury: if we just moved to PAID, record income
    if "payment_status" in update_data and update_data["payment_status"] == OrderPaymentStatus.PAID and order.payment_status != OrderPaymentStatus.PAID:
        await _record_finance_income(
            db, tenant_id, order.price_cents, 
            f"Paiement Commande #{str(order.id)[:8]}", 
            order_id=order.id
        )

    for field, value in update_data.items():
        setattr(order, field, value)

    # Force payment status to PAID if final price is 0
    if order.price_cents == 0:
        order.payment_status = OrderPaymentStatus.PAID

    # Transition to INSTALLMENT: generate installments if they don't exist
    payment_is_installment = order.payment_status == OrderPaymentStatus.INSTALLMENT
    
    # Force regenerate si demandé explicitement (switch vers échelonné sans changement de prix)
    force_regenerate = update_data.get("force_regenerate_installments", False)
    
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
        elif pricing_changed or force_regenerate:
            # Si le tarif a changé ou si la régénération est forcée,
            # on ne régénère que si AUCUNE échéance n'est encore payée ou en erreur
            can_regenerate = all(not inst.is_paid and not inst.is_error for inst in existing_installments)
            if can_regenerate:
                # Supprimer les anciennes et recréer
                for inst in existing_installments:
                    await db.delete(inst)
                await db.flush()
                
                new_installments = generate_installments(order, tenant_id)
                for inst in new_installments:
                    db.add(inst)
            elif force_regenerate:
                raise HTTPException(
                    status_code=400,
                    detail="Impossible de régénérer l'échéancier : une ou plusieurs échéances ont déjà été payées ou marquées en erreur."
                )

    await db.commit()
    await db.refresh(order)

    # Reload with relations
    result = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(joinedload(Order.user), joinedload(Order.offer), joinedload(Order.installments))
    )
    order = result.unique().scalar_one()

    # Get FIFO balances
    user_fifo_balances, _, _ = await order_service.compute_fifo_balances(db, order.user_id, tenant_id)
    order_fifo = user_fifo_balances.get(str(order.id), {})
    order_balance = order_fifo.get("balance")
    order_used = order_fifo.get("credits_used", 0)
    is_blocked = order_fifo.get("is_blocked", False)

    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"

    return order_service.build_order_response(
        order, 
        credits_used=order_used,
        global_balance=order_balance,
        global_credits_used=order_used,
        grace_period_days=grace_days,
        grace_period_mode=grace_mode,
        is_blocked_val=is_blocked
    )


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

    # Supprimer d'abord les échéances liées
    inst_result = await db.execute(
        select(Installment).where(Installment.order_id == order_id, Installment.tenant_id == tenant_id)
    )
    for inst in inst_result.scalars().all():
        await db.delete(inst)

    # Supprimer les transactions financières liées (auto-générées)
    tx_result = await db.execute(
        select(FinanceTransaction).where(FinanceTransaction.order_id == order_id, FinanceTransaction.tenant_id == tenant_id)
    )
    for tx in tx_result.scalars().all():
        await db.delete(tx)

    await db.flush()
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
    
    # Enregistrer la recette en trésorerie
    await _record_finance_income(
        db, tenant_id, inst.amount_cents, 
        f"Échéance Commande #{str(order_id)[:8]} (Régularisation)", 
        order_id=order_id
    )
    
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
