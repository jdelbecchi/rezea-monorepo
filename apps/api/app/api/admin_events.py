"""
API admin pour la gestion des événements
"""
from datetime import datetime, time
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import User, UserRole, Event, EventGroup, EventRegistration, EventRegistrationStatus
from app.schemas.schemas import EventCreate, EventUpdate, EventResponse, EventBulkCreate

router = APIRouter()


def _format_event_response(e: Event) -> dict:
    return {
        **{c.name: getattr(e, c.name) for c in e.__table__.columns},
        "event_time": e.event_time.strftime("%H:%M") if e.event_time else "",
        "event_group_id": e.event_group_id,
        "event_group": {
            "id": e.event_group.id,
            "tenant_id": e.event_group.tenant_id,
            "title": e.event_group.title,
            "payment_link": e.event_group.payment_link,
            "created_at": e.event_group.created_at,
            "updated_at": e.event_group.updated_at,
        } if e.event_group else None
    }


# ---- Auth dependency ----
async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
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


# ---- LIST GROUPS ----
@router.get("/groups")
async def list_event_groups(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste tous les groupes d'événements (événements parents) du tenant"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(EventGroup)
        .where(EventGroup.tenant_id == tenant_id)
        .order_by(EventGroup.title.asc())
    )
    groups = result.scalars().all()
    return [{"id": str(g.id), "title": g.title, "payment_link": g.payment_link} for g in groups]


# ---- LIST ----
@router.get("", response_model=List[EventResponse])
async def list_events(
    request: Request,
    include_inactive: Optional[bool] = Query(None),
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste tous les événements du tenant (du plus récent au plus ancien)"""
    tenant_id = request.state.tenant_id
    query = select(Event).options(selectinload(Event.event_group)).where(Event.tenant_id == tenant_id)
    if include_inactive is not None:
        if include_inactive:
            query = query.where(Event.is_active == False)
        else:
            query = query.where(Event.is_active == True)
        
    if not include_deleted:
        query = query.where(Event.deleted_at.is_(None))
        
    result = await db.execute(
        query.order_by(Event.event_date.desc(), Event.event_time.desc())
    )
    events = result.scalars().all()
    return [_format_event_response(e) for e in events]


# ---- CREATE ----
@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    event_data: EventCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Crée un nouvel événement"""
    tenant_id = request.state.tenant_id

    # Parse time
    hours, minutes = map(int, event_data.event_time.split(":"))
    event_time = time(hours, minutes)

    event_group_id = event_data.event_group_id
    if not event_group_id and event_data.group_title:
        group = EventGroup(
            tenant_id=tenant_id,
            title=event_data.group_title,
            payment_link=event_data.payment_link,
        )
        db.add(group)
        await db.flush()
        event_group_id = group.id

    new_event = Event(
        tenant_id=tenant_id,
        event_group_id=event_group_id,
        event_date=event_data.event_date,
        event_time=event_time,
        title=event_data.title,
        duration_minutes=event_data.duration_minutes,
        price_member_cents=event_data.price_member_cents,
        price_external_cents=event_data.price_external_cents,
        instructor_name=event_data.instructor_name,
        max_places=event_data.max_places,
        location=event_data.location,
        description=event_data.description,
        allow_waitlist=event_data.allow_waitlist,
        registrations_count=0,
        payment_link=event_data.payment_link if not event_group_id else None
    )

    db.add(new_event)
    await db.commit()
    
    # Reload with relation loaded
    res = await db.execute(
        select(Event)
        .options(selectinload(Event.event_group))
        .where(Event.id == new_event.id)
    )
    new_event = res.scalar_one()

    return _format_event_response(new_event)


# ---- CREATE BULK ----
@router.post("/bulk", response_model=List[EventResponse], status_code=status.HTTP_201_CREATED)
async def create_event_bulk(
    event_data: EventBulkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Crée un groupe d'événements et tous ses modules associés"""
    tenant_id = request.state.tenant_id

    # 1. Créer le groupe parent
    group = EventGroup(
        tenant_id=tenant_id,
        title=event_data.group_title,
        payment_link=event_data.payment_link
    )
    db.add(group)
    await db.flush()

    # 2. Créer chaque module
    created_events = []
    for mod in event_data.modules:
        hours, minutes = map(int, mod.event_time.split(":"))
        event_time = time(hours, minutes)
        
        new_event = Event(
            tenant_id=tenant_id,
            event_group_id=group.id,
            event_date=mod.event_date,
            event_time=event_time,
            title=mod.title,
            duration_minutes=mod.duration_minutes,
            price_member_cents=mod.price_member_cents,
            price_external_cents=mod.price_external_cents,
            instructor_name=mod.instructor_name,
            max_places=mod.max_places,
            location=mod.location,
            description=mod.description,
            allow_waitlist=mod.allow_waitlist,
            registrations_count=0,
        )
        db.add(new_event)
        created_events.append(new_event)

    await db.commit()

    # Charger avec la relation event_group
    event_ids = [e.id for e in created_events]
    res = await db.execute(
        select(Event)
        .options(selectinload(Event.event_group))
        .where(Event.id.in_(event_ids))
        .order_by(Event.event_date.asc(), Event.event_time.asc())
    )
    events = res.scalars().all()

    return [_format_event_response(e) for e in events]


# ---- EXPORT EXCEL ----
@router.get("/export")
async def export_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Exporte les événements en Excel"""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl non installé")

    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.tenant_id == tenant_id)
        .order_by(Event.event_date.desc(), Event.event_time.desc())
    )
    events = result.scalars().all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Événements"

    # Headers
    headers = [
        "Date", "Heure", "Intitulé", "Durée (min)",
        "Tarif Membre (€)", "Tarif Extérieur (€)",
        "Animateur", "Places", "Inscriptions", "Description"
    ]
    ws.append(headers)

    # Style headers
    from openpyxl.styles import Font
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = Font(bold=True)

    # Data
    for event in events:
        ws.append([
            event.event_date.strftime("%d/%m/%Y") if event.event_date else "",
            event.event_time.strftime("%H:%M") if event.event_time else "",
            event.title,
            event.duration_minutes,
            event.price_member_cents / 100,
            event.price_external_cents / 100,
            event.instructor_name,
            event.max_places,
            event.registrations_count or 0,
            event.description or "",
        ])

    # Auto-width
    for col in ws.columns:
        max_length = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 40)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=evenements.xlsx"}
    )


# ---- UPDATE ----
@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    event_data: EventUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Modifie un événement"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.event_group))
        .where(Event.id == event_id, Event.tenant_id == tenant_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    update_dict = event_data.model_dump(exclude_unset=True)

    if "group_title" in update_dict or "payment_link" in update_dict:
        group_title = update_dict.pop("group_title", None)
        payment_link = update_dict.pop("payment_link", None)
        
        if event.event_group_id:
            group_res = await db.execute(select(EventGroup).where(EventGroup.id == event.event_group_id))
            group = group_res.scalar_one_or_none()
            if group:
                if group_title is not None:
                    group.title = group_title
                if payment_link is not None:
                    group.payment_link = payment_link
        elif group_title:
            group = EventGroup(
                tenant_id=tenant_id,
                title=group_title,
                payment_link=payment_link
            )
            db.add(group)
            await db.flush()
            event.event_group_id = group.id

    # Handle time conversion
    if "event_time" in update_dict and update_dict["event_time"]:
        hours, minutes = map(int, update_dict["event_time"].split(":"))
        update_dict["event_time"] = time(hours, minutes)

    # Check if date/time changed to notify users
    date_changed = "event_date" in update_dict and update_dict["event_date"] != event.event_date
    time_changed = "event_time" in update_dict and update_dict["event_time"] != event.event_time

    for key, value in update_dict.items():
        setattr(event, key, value)

    await db.commit()
    
    # Reload relation
    res = await db.execute(
        select(Event)
        .options(selectinload(Event.event_group))
        .where(Event.id == event.id)
    )
    event = res.scalar_one()

    if date_changed or time_changed:
        try:
            from app.models.models import Tenant
            from app.services.email_service import EmailService
            
            # Load registrations with users
            res = await db.execute(
                select(EventRegistration)
                .where(EventRegistration.event_id == event.id, EventRegistration.status != EventRegistrationStatus.CANCELLED)
                .options(joinedload(EventRegistration.user))
            )
            regs = res.scalars().all()
            users = [r.user for r in regs if r.user]
            
            tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
            tenant = tenant_res.scalar_one_or_none()
            
            if users and tenant:
                await EmailService.send_bulk_event_modification(users, tenant, event)
        except Exception as e:
            from structlog import get_logger
            logger = get_logger()
            logger.error("❌ Erreur lors de l'envoi des emails de modification", error=str(e), event_id=str(event.id))

    return _format_event_response(event)


# ---- CANCEL / REACTIVATE ----
@router.post("/{event_id}/cancel", response_model=EventResponse)
async def cancel_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Annule un événement et marque les inscriptions comme annulées"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id, Event.tenant_id == tenant_id)
        .options(selectinload(Event.registrations).selectinload(EventRegistration.user))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    event.is_active = False
    
    # Marquer les inscriptions comme annulées par l'événement
    users_to_notify = []
    for reg in event.registrations:
        if reg.status in [EventRegistrationStatus.CONFIRMED, EventRegistrationStatus.PENDING_PAYMENT]:
            reg.status = EventRegistrationStatus.EVENT_CANCELLED
            if reg.user:
                users_to_notify.append(reg.user)
    
    await db.commit()
    await db.refresh(event)

    # Envoi des emails d'annulation
    if users_to_notify:
        try:
            from app.models.models import Tenant
            from app.services.email_service import EmailService
            tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
            tenant = tenant_res.scalar_one_or_none()
            if tenant:
                await EmailService.send_bulk_event_cancellation(users_to_notify, tenant, event)
        except Exception as e:
            from structlog import get_logger
            logger = get_logger()
            logger.error("❌ Erreur lors de l'envoi des emails d'annulation", error=str(e), event_id=str(event.id))

    return {
        **{c.name: getattr(event, c.name) for c in event.__table__.columns},
        "event_time": event.event_time.strftime("%H:%M"),
    }


@router.post("/{event_id}/reactivate", response_model=EventResponse)
async def reactivate_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Réactive un événement annulé"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id, Event.tenant_id == tenant_id)
        .options(selectinload(Event.registrations))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    event.is_active = True
    
    # Restaurer les inscriptions (à confirmer si on veut les remettre en CONFIRMED d'office)
    for reg in event.registrations:
        if reg.status == EventRegistrationStatus.EVENT_CANCELLED:
            reg.status = EventRegistrationStatus.CONFIRMED
            
    await db.commit()
    await db.refresh(event)

    return {
        **{c.name: getattr(event, c.name) for c in event.__table__.columns},
        "event_time": event.event_time.strftime("%H:%M"),
    }


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Supprime logiquement un événement (Soft Delete)"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id, Event.tenant_id == tenant_id)
        .options(selectinload(Event.registrations))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    # Soft Delete : masquer l'événement sans casser les relations financières
    event.is_active = False
    event.deleted_at = datetime.utcnow()
    
    # Marquer les inscriptions comme annulées par la suppression de l'événement
    for reg in event.registrations:
        if reg.status in [EventRegistrationStatus.CONFIRMED, EventRegistrationStatus.PENDING_PAYMENT]:
            reg.status = EventRegistrationStatus.EVENT_CANCELLED
    
    await db.commit()
    return None

