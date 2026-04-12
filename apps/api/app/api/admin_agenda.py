"""
API admin pour l'agenda — vue unifiée séances + événements
"""
from datetime import datetime, date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import (
    User, UserRole, Session, Booking, BookingStatus, Event, 
    WaitlistEntry, WaitlistStatus, EventRegistration, EventRegistrationStatus
)

router = APIRouter()


async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Accès réservé aux managers")
    return user


@router.get("")
async def get_agenda(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    start: Optional[str] = Query(None, description="Date de début YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="Date de fin YYYY-MM-DD"),
    search: Optional[str] = Query(None, description="Recherche"),
):
    """
    Retourne les séances et événements pour une plage de dates.
    Inclut les noms des inscrits pour les séances.
    """
    tenant_id = request.state.tenant_id

    # Parse dates
    if start:
        start_date = datetime.strptime(start, "%Y-%m-%d")
    else:
        today = date.today()
        start_date = datetime(today.year, today.month, today.day)

    if end:
        end_date = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    else:
        end_date = start_date + timedelta(days=7)

    # ---- Sessions ----
    session_query = (
        select(Session)
        .options(
            selectinload(Session.bookings).selectinload(Booking.user),
            selectinload(Session.waitlist_entries).selectinload(WaitlistEntry.user)
        )
        .where(
            Session.tenant_id == tenant_id,
            Session.is_active == True,
            Session.start_time >= start_date,
            Session.start_time <= end_date,
        )
        .order_by(Session.start_time)
    )

    if search:
        search_term = f"%{search}%"
        session_query = session_query.where(
            or_(
                Session.title.ilike(search_term),
                Session.activity_type.ilike(search_term),
            )
        )

    result = await db.execute(session_query)
    sessions = result.scalars().unique().all()

    sessions_data = []
    for s in sessions:
        # Get confirmed/pending bookings' user names
        registered_users = []
        waitlist_users = []
        for b in s.bookings:
            if not b.user: continue
            user_info = {
                "first_name": b.user.first_name,
                "last_name": b.user.last_name,
                "email": b.user.email,
            }
            if b.status == BookingStatus.CONFIRMED:
                registered_users.append(user_info)
            elif b.status == BookingStatus.PENDING:
                waitlist_users.append(user_info)

        sessions_data.append({
            "id": str(s.id),
            "type": "session",
            "title": s.title,
            "description": s.description,
            "activity_type": s.activity_type,
            "instructor_name": s.instructor_name,
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat(),
            "date": s.start_time.strftime("%Y-%m-%d"),
            "time": s.start_time.strftime("%H:%M"),
            "duration_minutes": int((s.end_time - s.start_time).total_seconds() / 60),
            "max_participants": s.max_participants,
            "current_participants": s.current_participants,
            "credits_required": s.credits_required,
            "location": s.location,
            "allow_waitlist": s.allow_waitlist,
            "registered_users": registered_users,
            "waitlist_users": waitlist_users,
            "waitlist_count": len(waitlist_users),
        })

    # ---- Events ----
    event_query = (
        select(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.event_date >= start_date.date(),
            Event.event_date <= end_date.date(),
        )
        .options(
            selectinload(Event.registrations).selectinload(EventRegistration.user)
        )
        .order_by(Event.event_date, Event.event_time)
    )

    if search:
        search_term = f"%{search}%"
        event_query = event_query.where(
            or_(
                Event.title.ilike(search_term),
                Event.instructor_name.ilike(search_term),
            )
        )

    result = await db.execute(event_query)
    events = result.scalars().all()

    events_data = []
    for e in events:
        # Separate registrations into confirmed and waitlist
        registered_users = []
        waitlist_users = []
        for reg in e.registrations:
            user_info = {
                "first_name": reg.user.first_name if reg.user else "Utilisateur",
                "last_name": reg.user.last_name if reg.user else "Inconnu",
                "email": reg.user.email if reg.user else "",
            }
            if reg.status == EventRegistrationStatus.CONFIRMED:
                registered_users.append(user_info)
            elif reg.status == EventRegistrationStatus.WAITING_LIST:
                waitlist_users.append(user_info)

        events_data.append({
            "id": str(e.id),
            "type": "event",
            "title": e.title,
            "description": e.description,
            "date": e.event_date.strftime("%Y-%m-%d"),
            "time": e.event_time.strftime("%H:%M") if e.event_time else "",
            "duration_minutes": e.duration_minutes,
            "instructor_name": e.instructor_name,
            "price_member_cents": e.price_member_cents,
            "price_external_cents": e.price_external_cents,
            "max_places": e.max_places,
            "registrations_count": e.registrations_count or 0,
            "waitlist_count": len(waitlist_users),
            "location": e.location,
            "allow_waitlist": e.allow_waitlist,
            "registered_users": registered_users,
            "waitlist_users": waitlist_users,
        })

    return {
        "sessions": sessions_data,
        "events": events_data,
    }
