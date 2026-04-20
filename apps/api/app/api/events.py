from datetime import date, datetime, timedelta
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.db.session import get_db
from app.models.models import Event, EventRegistration, EventRegistrationStatus, OrderPaymentStatus, Tenant
from app.schemas.schemas import EventResponse, EventRegistrationResponse

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
            "waitlist_count": e.waitlist_count or 0,
            "is_registered": e.id in registered_event_ids,
            "location": e.location,
            "description": e.description,
            "allow_waitlist": e.allow_waitlist,
            "is_active": e.is_active,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
        }
        response.append(data)
    return response



@router.get("/registrations", response_model=List[EventRegistrationResponse])
async def list_my_registrations(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Liste les inscriptions de l'utilisateur connecté"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    result = await db.execute(
        select(EventRegistration)
        .where(
            and_(
                EventRegistration.tenant_id == tenant_id,
                EventRegistration.user_id == user_id
            )
        )
        .options(joinedload(EventRegistration.event))
        .order_by(EventRegistration.created_at.desc())
    )
    registrations = result.unique().scalars().all()
    
    response = []
    for reg in registrations:
        try:
            status_val = str(reg.status.value) if hasattr(reg.status, "value") else str(reg.status)
            payment_val = str(reg.payment_status.value) if hasattr(reg.payment_status, "value") else str(reg.payment_status)
            
            response.append({
                "id": reg.id,
                "tenant_id": reg.tenant_id,
                "user_id": reg.user_id,
                "event_id": reg.event_id,
                "status": status_val,
                "price_paid_cents": reg.price_paid_cents or 0,
                "payment_status": payment_val,
                "created_by_admin": bool(reg.created_by_admin),
                "notes": reg.notes,
                "created_at": reg.created_at,
                "cancelled_at": reg.cancelled_at,
                "event_title": reg.event.title if reg.event else "Événement inconnu",
                "event_date": reg.event.event_date.isoformat() if (reg.event and reg.event.event_date) else "",
                "event_time": reg.event.event_time.strftime("%H:%M") if (reg.event and reg.event.event_time) else "",
                "instructor_name": reg.event.instructor_name if reg.event else None,
                "user_name": "", 
                "user_phone": None,
                "instagram_handle": None,
                "facebook_handle": None,
                "has_pending_order": False
            })
        except Exception as e:
            print(f"ERROR mapping registration {reg.id}: {e}")
            continue
            
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
        "location": e.location,
        "description": e.description,
        "allow_waitlist": e.allow_waitlist,
        "is_active": e.is_active,
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
        
    # 1.5 Vérifier le délai d'inscription
    tenant_res = await db.execute(select(Tenant.registration_limit_mins).where(Tenant.id == tenant_id))
    reg_limit_mins = tenant_res.scalar() or 0
    
    now = datetime.utcnow()
    event_start = datetime.combine(event.event_date, event.event_time)
    reg_limit_time = event_start - timedelta(minutes=reg_limit_mins)
    
    if now > reg_limit_time:
        detail = "Le délai d'inscription est dépassé."
        if reg_limit_mins > 0:
            detail = f"Le délai d'inscription est dépassé ({reg_limit_mins} min avant le début)."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail
        )
        
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
    
    # 4.5 Récupérer le tenant pour vérifier le lien de paiement
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    
    # Si aucun lien de redirection, on force le paiement différé
    is_link_missing = not tenant.payment_redirect_link if tenant else False
    effective_pay_later = pay_later or is_link_missing

    registration = EventRegistration(
        tenant_id=tenant_id,
        user_id=user_id,
        event_id=event_id,
        price_paid_cents=price_cents,
        payment_status=OrderPaymentStatus.WAITING if effective_pay_later else OrderPaymentStatus.PENDING,
        status=EventRegistrationStatus.CONFIRMED,
        notes=f"Inscription via PWA (Tarif {tariff}) {' - Paiement différé' if effective_pay_later else ''}"
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

