from datetime import date, datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Event, EventRegistration, EventRegistrationStatus, OrderPaymentStatus
from app.schemas.schemas import EventResponse

router = APIRouter()


@router.get("/upcoming", response_model=List[EventResponse])
async def list_upcoming_events(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Liste les événements à venir pour les membres"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Event)
        .where(
            and_(
                Event.tenant_id == tenant_id,
                Event.event_date >= date.today()
            )
        )
        .order_by(Event.event_date.asc(), Event.event_time.asc())
    )
    events = result.scalars().all()
    user_id = request.state.user_id
    
    # Get all registrations for this user to check them once
    reg_result = await db.execute(
        select(EventRegistration.event_id).where(
            and_(
                EventRegistration.user_id == user_id,
                EventRegistration.status != EventRegistrationStatus.CANCELLED
            )
        )
    )
    registered_event_ids = set(reg_result.scalars().all())
    
    # Formatage de l'heure pour le schéma
    response = []
    for e in events:
        data = {
            "id": e.id,
            "tenant_id": e.tenant_id,
            "event_date": e.event_date,
            "event_time": e.event_time.strftime("%H:%M") if e.event_time else "",
            "title": e.title,
            "duration_minutes": e.duration_minutes,
            "price_member_cents": e.price_member_cents,
            "price_external_cents": e.price_external_cents,
            "instructor_name": e.instructor_name,
            "max_places": e.max_places,
            "registrations_count": e.registrations_count or 0,
            "is_registered": e.id in registered_event_ids,
            "description": e.description,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
        }
        response.append(data)
    return response


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Récupère les détails d'un événement"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Event).where(
            and_(
                Event.id == event_id,
                Event.tenant_id == tenant_id
            )
        )
    )
    e = result.scalar_one_or_none()
    user_id = request.state.user_id
    
    if not e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Événement non trouvé"
        )
        
    # Check registration
    reg_result = await db.execute(
        select(EventRegistration).where(
            and_(
                EventRegistration.event_id == event_id,
                EventRegistration.user_id == user_id,
                EventRegistration.status != EventRegistrationStatus.CANCELLED
            )
        )
    )
    is_registered = reg_result.scalar_one_or_none() is not None
        
    return {
        "id": e.id,
        "tenant_id": e.tenant_id,
        "event_date": e.event_date,
        "event_time": e.event_time.strftime("%H:%M") if e.event_time else "",
        "title": e.title,
        "duration_minutes": e.duration_minutes,
        "price_member_cents": e.price_member_cents,
        "price_external_cents": e.price_external_cents,
        "instructor_name": e.instructor_name,
        "max_places": e.max_places,
        "registrations_count": e.registrations_count or 0,
        "is_registered": is_registered,
        "description": e.description,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


@router.post("/{event_id}/checkout")
async def event_checkout(
    event_id: UUID,
    tariff: str, # "member" or "external"
    request: Request,
    db: AsyncSession = Depends(get_db),
    pay_later: bool = False,
):
    """Initialise l'inscription (checkout) à un événement"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # 1. Récupérer l'événement
    result = await db.execute(
        select(Event).where(and_(Event.id == event_id, Event.tenant_id == tenant_id))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")
        
    # 2. Vérifier si complet
    if (event.registrations_count or 0) >= event.max_places:
        raise HTTPException(status_code=409, detail="Cet événement est complet")
        
    # 3. Vérifier si déjà inscrit
    result = await db.execute(
        select(EventRegistration).where(
            and_(
                EventRegistration.event_id == event_id,
                EventRegistration.user_id == user_id,
                EventRegistration.status != EventRegistrationStatus.CANCELLED
            )
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Vous êtes déjà inscrit à cet événement")

    # 4. Calculer le prix
    price_cents = event.price_member_cents if tariff == "member" else event.price_external_cents
    
    # 5. Créer l'inscription
    # Si pay_later = True, payment_status = WAITING, else on pourrait imaginer un redirect
    # Pour l'instant on suit la logique de la boutique
    payment_status = OrderPaymentStatus.WAITING if pay_later else OrderPaymentStatus.WAITING
    # NOTE: En fait boutique met WAITING par défaut si "pay_later" est coché.
    # Si non coché, it might go to HelloAsso/Stripe but here we just initialize it as WAITING for now
    # until we have the payment link integration for events too.
    
    registration = EventRegistration(
        tenant_id=tenant_id,
        user_id=user_id,
        event_id=event_id,
        price_paid_cents=price_cents,
        payment_status=OrderPaymentStatus.WAITING if pay_later else OrderPaymentStatus.PENDING,
        status=EventRegistrationStatus.PENDING_PAYMENT,
        notes=f"Inscription via PWA (Tarif {tariff}) {' - Paiement différé' if pay_later else ''}"
    )
    
    db.add(registration)
    event.registrations_count = (event.registrations_count or 0) + 1
    
    await db.commit()
    await db.refresh(registration)
    
    return {
        "registration_id": registration.id,
        "message": "Inscription initialisée avec succès",
        "price_cents": price_cents
    }
