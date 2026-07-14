import datetime
from dateutil.relativedelta import relativedelta
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Tuple
from sqlalchemy import select, func, and_
from app.models.models import Order, Booking, BookingStatus

def compute_period_bounds(order_start: datetime.date, target_date: datetime.date, period_str: str) -> Tuple[datetime.date, datetime.date]:
    current_start = order_start
    while True:
        if period_str == "/semaine":
            next_start = current_start + datetime.timedelta(weeks=1)
        elif period_str == "/mois":
            next_start = current_start + relativedelta(months=1)
        elif period_str == "/bimestre":
            next_start = current_start + relativedelta(months=2)
        elif period_str == "/trimestre":
            next_start = current_start + relativedelta(months=3)
        elif period_str == "/an":
            next_start = current_start + relativedelta(years=1)
        else:
            next_start = current_start + relativedelta(months=1)

        if current_start <= target_date < next_start:
            return current_start, next_start - datetime.timedelta(days=1)
            
        current_start = next_start
        if target_date < order_start:
            return current_start, next_start - datetime.timedelta(days=1)

async def compute_limit_balance_for_date(db: AsyncSession, order: Order, target_date: datetime.date) -> Optional[dict]:
    limit_amount = order.limit_amount if order.limit_amount is not None else order.offer_snap_limit_amount
    limit_period = order.limit_period if order.limit_period is not None else order.offer_snap_limit_period
    
    if limit_amount is None or limit_period is None:
        return None
        
    start_bound, end_bound = compute_period_bounds(order.start_date, target_date, limit_period)
    
    today = datetime.date.today()
    is_current_period = start_bound <= today <= end_bound
    is_future_period = target_date > today and today < start_bound
    
    base_limit = float(limit_amount)
    if is_current_period:
        base_limit += float(order.accumulated_rollover or 0)
    
    from app.models.models import Session
    conditions = [
        Booking.user_id == order.user_id,
        Booking.tenant_id == order.tenant_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
        func.date(Session.start_time) >= start_bound,
        func.date(Session.start_time) <= end_bound,
    ]
    
    result = await db.execute(
        select(func.coalesce(func.sum(Booking.credits_used), 0))
        .join(Session, Session.id == Booking.session_id)
        .where(and_(*conditions))
    )
    credits_used = float(result.scalar() or 0)
    
    return {
        "limit_amount": float(limit_amount),
        "limit_period": limit_period,
        "period_start": start_bound,
        "period_end": end_bound,
        "base_limit": base_limit,
        "credits_used": credits_used,
        "balance": max(0, base_limit - credits_used),
        "is_current_period": is_current_period,
        "is_future_period": is_future_period,
        "allowed_activities": order.offer_snap_allowed_activities if order.offer_snap_allowed_activities is not None else []
    }
