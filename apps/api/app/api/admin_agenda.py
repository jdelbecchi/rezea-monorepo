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
    WaitlistEntry, WaitlistStatus, EventRegistration, EventRegistrationStatus,
    Order, OrderPaymentStatus
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
    Inclut les noms des inscrits pour les séances et les warnings de paiement.
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

    # Collect all user IDs to check pending orders in bulk
    all_user_ids = set()
    for s in sessions:
        for b in s.bookings:
            if b.user_id: all_user_ids.add(b.user_id)
    
    # ---- Events Preview (for ID collection) ----
    event_query_pre = (
        select(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.is_active == True,
            Event.event_date >= start_date.date(),
            Event.event_date <= end_date.date(),
        )
        .options(
            selectinload(Event.registrations)
        )
    )
    result_pre = await db.execute(event_query_pre)
    events_pre = result_pre.scalars().all()
    for e in events_pre:
        for reg in e.registrations:
            if reg.user_id: all_user_ids.add(reg.user_id)

    # Check pending orders
    users_with_pending = set()
    if all_user_ids:
        pending_orders_result = await db.execute(
            select(Order.user_id).where(
                Order.tenant_id == tenant_id,
                Order.user_id.in_(all_user_ids),
                Order.payment_status.in_([
                    OrderPaymentStatus.PENDING, 
                    OrderPaymentStatus.WAITING,
                    OrderPaymentStatus.ISSUE
                ])
            )
        )
        users_with_pending = set(pending_orders_result.scalars().all())

    status_priority = {
        'confirmed': 100,
        'confirmed_payment': 100,
        'absent': 100,
        'waiting_list': 50,
        'pending': 50,
        'pending_payment': 50,
        'cancelled': 10,
        'session_cancelled': 10,
        'event_cancelled': 10
    }

    sessions_data = []
    for s in sessions:
        user_best_booking = {}
        for b in s.bookings:
            if not b.user_id: continue
            uid = str(b.user_id)
            status = b.status.value if hasattr(b.status, 'value') else b.status
            priority = status_priority.get(status, 0)
            
            if uid not in user_best_booking:
                user_best_booking[uid] = (priority, b)
            else:
                existing_p, existing_b = user_best_booking[uid]
                if priority > existing_p or (priority == existing_p and str(b.id) > str(existing_b.id)):
                    user_best_booking[uid] = (priority, b)

        registered_users = []
        for priority, b in user_best_booking.values():
            user_info = {
                "id": str(b.id),
                "user_id": str(b.user_id) if b.user_id else None,
                "first_name": b.user.first_name,
                "last_name": b.user.last_name,
                "email": b.user.email,
                "phone": b.user.phone,
                "instagram_handle": b.user.instagram_handle,
                "facebook_handle": b.user.facebook_handle,
                "is_suspended": b.user.is_suspended,
                "has_pending_order": b.user.id in users_with_pending,
                "status": b.status.value if hasattr(b.status, 'value') else b.status
            }
            registered_users.append(user_info)

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
            "is_active": s.is_active,
            "registered_users": registered_users,
            "waitlist_users": [],
            "waitlist_count": 0,
        })

    # ---- Events ----
    event_query = (
        select(Event)
        .where(
            Event.tenant_id == tenant_id,
            Event.is_active == True,
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
        user_best_reg = {}
        for reg in e.registrations:
            if not reg.user_id: continue
            uid = str(reg.user_id)
            status = reg.status.value if hasattr(reg.status, 'value') else reg.status
            priority = status_priority.get(status, 0)
            
            if uid not in user_best_reg:
                user_best_reg[uid] = (priority, reg)
            else:
                existing_p, existing_reg = user_best_reg[uid]
                if priority > existing_p or (priority == existing_p and str(reg.id) > str(existing_reg.id)):
                    user_best_reg[uid] = (priority, reg)

        reg_users = []
        for priority, reg in user_best_reg.values():
            reg_users.append({
                "id": str(reg.id),
                "user_id": str(reg.user_id) if reg.user_id else None,
                "first_name": reg.user.first_name,
                "last_name": reg.user.last_name,
                "email": reg.user.email,
                "phone": reg.user.phone,
                "instagram_handle": reg.user.instagram_handle,
                "facebook_handle": reg.user.facebook_handle,
                "is_suspended": reg.user.is_suspended,
                "has_pending_order": reg.user.id in users_with_pending,
                "status": reg.status.value if hasattr(reg.status, 'value') else reg.status
            })

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
            "max_participants": e.max_places,
            "current_participants": e.registrations_count or 0,
            "credits_required": e.price_member_cents / 100,
            "registrations_count": e.registrations_count or 0,
            "waitlist_count": e.waitlist_count or 0,
            "location": e.location,
            "allow_waitlist": e.allow_waitlist,
            "is_active": e.is_active,
            "registered_users": reg_users,
            "waitlist_users": [],
        })

    return {
        "sessions": sessions_data,
        "events": events_data,
    }
