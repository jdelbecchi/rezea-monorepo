"""
API admin pour la gestion des événements
"""
from datetime import datetime, time
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import User, UserRole, Event
from app.schemas.schemas import EventCreate, EventUpdate, EventResponse

router = APIRouter()


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


# ---- LIST ----
@router.get("", response_model=List[EventResponse])
async def list_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste tous les événements du tenant (du plus récent au plus ancien)"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event)
        .where(Event.tenant_id == tenant_id)
        .order_by(Event.event_date.desc(), Event.event_time.desc())
    )
    events = result.scalars().all()
    # Convert time objects to strings for response
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
            "description": e.description,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
        }
        response.append(data)
    return response


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

    new_event = Event(
        tenant_id=tenant_id,
        event_date=event_data.event_date,
        event_time=event_time,
        title=event_data.title,
        duration_minutes=event_data.duration_minutes,
        price_member_cents=event_data.price_member_cents,
        price_external_cents=event_data.price_external_cents,
        instructor_name=event_data.instructor_name,
        max_places=event_data.max_places,
        description=event_data.description,
        registrations_count=0,
    )

    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    return {
        **{c.name: getattr(new_event, c.name) for c in new_event.__table__.columns},
        "event_time": new_event.event_time.strftime("%H:%M"),
    }


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
        select(Event).where(Event.id == event_id, Event.tenant_id == tenant_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    update_dict = event_data.model_dump(exclude_unset=True)

    # Handle time conversion
    if "event_time" in update_dict and update_dict["event_time"]:
        hours, minutes = map(int, update_dict["event_time"].split(":"))
        update_dict["event_time"] = time(hours, minutes)

    for key, value in update_dict.items():
        setattr(event, key, value)

    await db.commit()
    await db.refresh(event)

    return {
        **{c.name: getattr(event, c.name) for c in event.__table__.columns},
        "event_time": event.event_time.strftime("%H:%M"),
    }


# ---- DELETE ----
@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Supprime un événement"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.tenant_id == tenant_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Événement non trouvé")

    await db.delete(event)
    await db.commit()

