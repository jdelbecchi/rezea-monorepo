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


def compute_end_date(offer: Offer, start_date: date) -> Optional[date]:
    """Calcule la date de fin en fonction de l'offre. Retourne None si illimitée."""
    if offer.is_validity_unlimited:
        return None
    if offer.validity_days:
        if offer.validity_unit == "months":
            return start_date + relativedelta(months=offer.validity_days)
        return start_date + timedelta(days=offer.validity_days)
    if offer.deadline_date:
        return offer.deadline_date
    # Fallback: 1 an
    return start_date + timedelta(days=365)


def normalize_status(status_str: Optional[str]) -> Optional[str]:
    """Normalise les statuts pour éviter les doublons (casse, accents)"""
    if not status_str:
        return None
    s = status_str.strip()
    lower_s = s.lower()
    
    # Mappings standards
    if lower_s in ["en cours", "en_cours", "encours"]:
        return "en_cours"
    if lower_s in ["termine", "terminé", "terminée", "terminé ", "termine "]:
        return "termine"
    
    return s


async def compute_credits_used(db: AsyncSession, user_id, tenant_id, start_date: date, end_date: Optional[date]) -> int:
    """Compte les crédits consommés par les bookings confirmés dans la période"""
    conditions = [
        Booking.user_id == user_id,
        Booking.tenant_id == tenant_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
        Booking.created_at >= datetime.combine(start_date, datetime.min.time()),
    ]
    if end_date:
        conditions.append(Booking.created_at <= datetime.combine(end_date, datetime.max.time()))
    
    result = await db.execute(
        select(func.coalesce(func.sum(Booking.credits_used), 0)).where(and_(*conditions))
    )
    return result.scalar() or 0


def build_order_response(order: Order, credits_used: int) -> dict:
    """Construit la réponse avec les champs calculés"""
    balance = None
    if not order.is_unlimited and order.credits_total is not None:
        balance = order.credits_total - credits_used

    # Logic: use manual status if present, otherwise calculate automatic one
    display_status = order.status
    if not display_status:
        today = date.today()
        if order.is_validity_unlimited:
            display_status = "en_cours"
        else:
            display_status = "termine" if order.end_date and order.end_date < today else "en_cours"

    # Installments status logic
    # Perçu = J+7 passés (non erreur) OR resolved_at
    # À venir = J+7 futurs (non erreur)
    # Impayés = is_error (non résolu)
    
    received_cents = 0
    pending_cents = 0
    error_cents = 0
    
    today = date.today()
    for inst in order.installments:
        amount = int(inst.amount_cents)
        if inst.is_error and not inst.resolved_at:
            error_cents += amount
        elif inst.is_paid or inst.resolved_at or (inst.due_date + timedelta(days=7) <= today):
            received_cents += amount
        else:
            pending_cents += amount

    # If the order is NOT installment/issue, it might be a lump sum
    if order.payment_status == OrderPaymentStatus.PAID:
        received_cents = order.price_cents
        pending_cents = 0
    elif order.payment_status == OrderPaymentStatus.WAITING or order.payment_status == OrderPaymentStatus.PENDING:
        received_cents = 0
        pending_cents = order.price_cents

    return OrderResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        user_id=order.user_id,
        offer_id=order.offer_id,
        start_date=order.start_date,
        end_date=order.end_date,
        is_validity_unlimited=order.is_validity_unlimited,
        credits_total=order.credits_total,
        is_unlimited=order.is_unlimited,
        price_cents=order.price_cents,
        payment_status=order.payment_status,
        comment=order.comment,
        created_by_admin=order.created_by_admin,
        created_at=order.created_at,
        updated_at=order.updated_at,
        invoice_number=order.invoice_number,
        invoice_url=order.invoice_url,
        user_name=f"{order.user.first_name} {order.user.last_name}",
        user_email=order.user.email or "",
        offer_code=order.offer.offer_code,
        offer_name=order.offer.name,
        offer_period=order.offer.period,
        offer_featured_pricing=order.offer.featured_pricing,
        offer_price_recurring_cents=order.offer.price_recurring_cents,
        offer_price_lump_sum_cents=order.offer.price_lump_sum_cents,
        offer_recurring_count=order.offer.recurring_count,
        credits_used=credits_used,
        balance=balance,
        status=display_status,
        received_cents=received_cents,
        pending_cents=pending_cents,
        error_cents=error_cents,
    )


def generate_installments(order: Order, offer: Offer, tenant_id) -> List[Installment]:
    """Génère les échéances pour une commande échelonnée"""
    installments = []
    
    # Si pas de prix récurrent, rien à faire
    if not offer.price_recurring_cents:
        return installments

    # Si pas de nombre d'occurrences (abonnement), on génère par défaut 12 mois
    count = offer.recurring_count or 12

    for i in range(count):
        # Date d'anniversaire : le 8 du mois, à partir du mois suivant la commande
        due_date = order.start_date + relativedelta(months=i + 1)
        due_date = due_date.replace(day=8)

        installments.append(Installment(
            tenant_id=tenant_id,
            order_id=order.id,
            due_date=due_date,
            amount_cents=offer.price_recurring_cents,
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
        credits_used = await compute_credits_used(
            db, order.user_id, order.tenant_id, order.start_date, order.end_date
        )
        responses.append(build_order_response(order, credits_used))

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
    base_statuses = ["en_cours", "termine"]
    manual_statuses = [row[0] for row in result.all() if row[0] not in base_statuses]
    all_statuses = base_statuses + sorted(manual_statuses)
    
    return all_statuses


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

    end_date = compute_end_date(offer, data.start_date)
    
    if offer.is_validity_unlimited:
        initial_status = "en_cours"
    else:
        initial_status = "termine" if end_date and end_date < date.today() else "en_cours"

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
        payment_status=payment_status,
        comment=data.comment,
        status=normalize_status(initial_status),
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

    credits_used = await compute_credits_used(
        db, order.user_id, order.tenant_id, order.start_date, order.end_date
    )
    return build_order_response(order, credits_used)


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
        update_data["status"] = normalize_status(update_data["status"])
        
    for field, value in update_data.items():
        setattr(order, field, value)

    # Transition to INSTALLMENT: generate installments if they don't exist
    if "payment_status" in update_data and update_data["payment_status"] == OrderPaymentStatus.INSTALLMENT:
        # Check if installments already exist
        check_result = await db.execute(select(Installment).where(Installment.order_id == order.id))
        if not check_result.scalars().first():
            installments = generate_installments(order, order.offer, tenant_id)
            for inst in installments:
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

    credits_used = await compute_credits_used(
        db, order.user_id, order.tenant_id, order.start_date, order.end_date
    )
    return build_order_response(order, credits_used)


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
