"""
API admin pour la gestion des inscriptions aux événements
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.models import (
    User, UserRole, Event, EventRegistration,
    EventRegistrationStatus, OrderPaymentStatus,
)
from app.schemas.schemas import (
    EventRegistrationCreate, EventRegistrationUpdate, EventRegistrationResponse,
)

router = APIRouter()


# ---- Auth ----
async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux managers")
    return user


def build_response(reg: EventRegistration) -> EventRegistrationResponse:
    event = reg.event
    user = reg.user
    return EventRegistrationResponse(
        id=reg.id,
        tenant_id=reg.tenant_id,
        user_id=reg.user_id,
        event_id=reg.event_id,
        status=reg.status.value if hasattr(reg.status, 'value') else str(reg.status),
        price_paid_cents=reg.price_paid_cents,
        payment_status=reg.payment_status.value if hasattr(reg.payment_status, 'value') else str(reg.payment_status),
        created_by_admin=reg.created_by_admin or False,
        notes=reg.notes,
        created_at=reg.created_at,
        cancelled_at=reg.cancelled_at,
        event_date=event.event_date.strftime("%Y-%m-%d") if event else "",
        event_time=event.event_time.strftime("%H:%M") if event and event.event_time else "",
        event_title=event.title if event else "",
        user_name=f"{user.first_name} {user.last_name}" if user else "",
    )


# ---- EVENTS LIST (for create dropdown) ----
@router.get("/events")
async def list_events_for_registrations(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.tenant_id == tenant_id)
        .order_by(Event.event_date.desc(), Event.event_time.desc())
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "title": e.title,
            "event_date": e.event_date.isoformat(),
            "event_time": e.event_time.strftime("%H:%M") if e.event_time else "",
            "max_places": e.max_places,
            "registrations_count": e.registrations_count or 0,
            "price_member_cents": e.price_member_cents,
            "price_external_cents": e.price_external_cents,
        }
        for e in events
    ]


# ---- LIST ----
@router.get("", response_model=List[EventRegistrationResponse])
async def list_registrations(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    status_filter: Optional[str] = Query(None, alias="status"),
    payment_status_filter: Optional[str] = Query(None, alias="payment"),
):
    tenant_id = request.state.tenant_id
    query = (
        select(EventRegistration)
        .where(EventRegistration.tenant_id == tenant_id)
        .options(joinedload(EventRegistration.event), joinedload(EventRegistration.user))
        .order_by(EventRegistration.created_at.desc())
    )

    if status_filter == "confirmed":
        query = query.where(EventRegistration.status == EventRegistrationStatus.CONFIRMED)
    elif status_filter == "cancelled":
        query = query.where(EventRegistration.status == EventRegistrationStatus.CANCELLED)
    elif status_filter == "absent":
        query = query.where(EventRegistration.status == EventRegistrationStatus.ABSENT)
    elif status_filter == "waiting_list":
        query = query.where(EventRegistration.status == EventRegistrationStatus.WAITING_LIST)

    if payment_status_filter:
        query = query.where(EventRegistration.payment_status == OrderPaymentStatus(payment_status_filter))

    result = await db.execute(query)
    registrations = result.unique().scalars().all()
    return [build_response(r) for r in registrations]


async def auto_promote_event_waitlist(db: AsyncSession, tenant_id, event_id):
    """
    Promeut automatiquement le 1er inscrit en liste d'attente vers actif
    quand une place se libère.
    """
    # Trouver le 1er en attente
    result = await db.execute(
        select(EventRegistration)
        .where(
            EventRegistration.tenant_id == tenant_id,
            EventRegistration.event_id == event_id,
            EventRegistration.status == EventRegistrationStatus.WAITING_LIST,
        )
        .order_by(EventRegistration.created_at.asc())
        .limit(1)
    )
    next_reg = result.scalar_one_or_none()

    if not next_reg:
        return None

    # Déterminer le nouveau statut selon le paiement
    if next_reg.payment_status == OrderPaymentStatus.PAID:
        next_reg.status = EventRegistrationStatus.CONFIRMED
    else:
        next_reg.status = EventRegistrationStatus.PENDING_PAYMENT

    # Incrémenter le compteur de l'événement
    event_result = await db.execute(
        select(Event).where(Event.id == event_id).with_for_update()
    )
    event = event_result.scalar_one_or_none()
    if event:
        event.registrations_count = (event.registrations_count or 0) + 1

    return next_reg


# ---- CREATE ----
@router.post("", response_model=EventRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def create_registration(
    request: Request,
    data: EventRegistrationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id

    # Vérifier utilisateur
    user_result = await db.execute(
        select(User).where(User.id == data.user_id, User.tenant_id == tenant_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Vérifier événement
    event_result = await db.execute(
        select(Event).where(Event.id == data.event_id, Event.tenant_id == tenant_id).with_for_update()
    )
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    # Vérifier doublon
    existing = await db.execute(
        select(EventRegistration).where(
            EventRegistration.tenant_id == tenant_id,
            EventRegistration.user_id == data.user_id,
            EventRegistration.event_id == data.event_id,
            EventRegistration.status.in_([
                EventRegistrationStatus.PENDING_PAYMENT,
                EventRegistrationStatus.CONFIRMED,
            ]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cet utilisateur est déjà inscrit à cet événement")

    # Vérifier places
    is_waitlist = False
    if (event.registrations_count or 0) >= event.max_places:
        is_waitlist = True

    # Déterminer le tarif si non fourni
    price = data.price_paid_cents
    if price == 0 and event.price_member_cents > 0:
        price = event.price_member_cents

    # Déterminer le statut initial en fonction du paiement et de la place
    payment = data.payment_status or OrderPaymentStatus.PENDING
    if is_waitlist:
        reg_status = EventRegistrationStatus.WAITING_LIST
    elif payment == OrderPaymentStatus.PAID:
        reg_status = EventRegistrationStatus.CONFIRMED
    else:
        reg_status = EventRegistrationStatus.PENDING_PAYMENT

    registration = EventRegistration(
        tenant_id=tenant_id,
        user_id=data.user_id,
        event_id=data.event_id,
        status=reg_status,
        price_paid_cents=price,
        payment_status=payment,
        notes=data.notes,
        created_by_admin=True,
    )
    db.add(registration)

    # Incrémenter le compteur seulement si pas en liste d'attente
    if not is_waitlist:
        event.registrations_count = (event.registrations_count or 0) + 1

    await db.commit()

    # Reload
    result = await db.execute(
        select(EventRegistration)
        .where(EventRegistration.id == registration.id)
        .options(joinedload(EventRegistration.event), joinedload(EventRegistration.user))
    )
    registration = result.unique().scalar_one()
    return build_response(registration)


# ---- UPDATE ----
@router.patch("/{registration_id}", response_model=EventRegistrationResponse)
async def update_registration(
    registration_id: str,
    request: Request,
    data: EventRegistrationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(EventRegistration)
        .where(EventRegistration.id == registration_id, EventRegistration.tenant_id == tenant_id)
        .options(joinedload(EventRegistration.event), joinedload(EventRegistration.user))
    )
    reg = result.unique().scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    update_data = data.model_dump(exclude_unset=True)

    # Gestion du changement de statut
    if "status" in update_data:
        new_status = update_data["status"]

        # Annulation → place libérée
        if new_status == "cancelled" and reg.status not in (
            EventRegistrationStatus.CANCELLED,
            EventRegistrationStatus.EVENT_DELETED,
        ):
            old_status = reg.status
            reg.cancelled_at = datetime.utcnow()
            # Libérer la place si le statut était actif
            if reg.event and old_status in (EventRegistrationStatus.CONFIRMED, EventRegistrationStatus.PENDING_PAYMENT):
                reg.event.registrations_count = max(0, (reg.event.registrations_count or 0) - 1)
                # Promouvoir le prochain
                await auto_promote_event_waitlist(db, tenant_id, reg.event_id)

        # Confirmation (paiement reçu)
        if new_status == "confirmed" and reg.status == EventRegistrationStatus.PENDING_PAYMENT:
            reg.payment_status = OrderPaymentStatus.PAID

        reg.status = EventRegistrationStatus(new_status)

    # Gestion du changement de paiement
    if "payment_status" in update_data and "status" not in update_data:
        new_payment = update_data["payment_status"]
        reg.payment_status = new_payment
        # Si paiement validé et statut en attente → confirmer automatiquement
        if new_payment == OrderPaymentStatus.PAID and reg.status == EventRegistrationStatus.PENDING_PAYMENT:
            reg.status = EventRegistrationStatus.CONFIRMED

    # Notes
    if "notes" in update_data:
        reg.notes = update_data["notes"]

    # Tarif
    if "price_paid_cents" in update_data:
        reg.price_paid_cents = update_data["price_paid_cents"]

    await db.commit()

    # Reload
    result = await db.execute(
        select(EventRegistration)
        .where(EventRegistration.id == reg.id)
        .options(joinedload(EventRegistration.event), joinedload(EventRegistration.user))
    )
    reg = result.unique().scalar_one()
    return build_response(reg)


# ---- DELETE ----
@router.delete("/{registration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_registration(
    registration_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(EventRegistration)
        .where(EventRegistration.id == registration_id, EventRegistration.tenant_id == tenant_id)
        .options(joinedload(EventRegistration.event))
    )
    reg = result.unique().scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    # Libérer la place si active
    if reg.status in (EventRegistrationStatus.PENDING_PAYMENT, EventRegistrationStatus.CONFIRMED):
        if reg.event:
            reg.event.registrations_count = max(0, (reg.event.registrations_count or 0) - 1)
            # Promouvoir le prochain
            await auto_promote_event_waitlist(db, tenant_id, reg.event_id)

    await db.delete(reg)
    await db.commit()
