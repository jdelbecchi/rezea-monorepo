import structlog
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Order, Installment, OrderPaymentStatus, Booking, Session, BookingStatus, Tenant
from app.services.orders import compute_fifo_balances, compute_effective_end_date, normalize_status

logger = structlog.get_logger()

async def sync_threshold_installments(db: AsyncSession, user_id: str, tenant_id: str):
    """
    Recalculates consumption for all threshold-triggered installment orders of the user.
    Sets or resets installment due dates based on whether the consumption threshold is reached.
    """
    logger.info("Running sync_threshold_installments", user_id=user_id, tenant_id=tenant_id)
    
    from uuid import UUID
    if isinstance(user_id, str):
        user_id = UUID(user_id)
    if isinstance(tenant_id, str):
        tenant_id = UUID(tenant_id)

    # 1. Fetch all threshold-based orders in INSTALLMENT payment status for this user
    orders_res = await db.execute(
        select(Order)
        .options(selectinload(Order.installments))
        .where(
            and_(
                Order.user_id == user_id,
                Order.tenant_id == tenant_id,
                Order.payment_status == OrderPaymentStatus.INSTALLMENT,
                Order.period.in_(["/seuil", "seuil"]),
                Order.trigger_consumption_percent.isnot(None)
            )
        )
    )
    orders = orders_res.scalars().all()
    if not orders:
        return

    # 2. Get grace period parameters
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"

    # 3. Load all bookings of the user (confirmed, completed, and active pending waitlist entries)
    # sorted chronologically to reproduce FIFO order
    bookings_res = await db.execute(
        select(Booking)
        .join(Session)
        .where(
            and_(
                Booking.user_id == user_id,
                Booking.tenant_id == tenant_id,
                or_(
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
                    and_(
                        Booking.status == BookingStatus.PENDING,
                        Session.start_time >= datetime.utcnow()
                    )
                )
            )
        )
        .order_by(Session.start_time.asc())
    )
    bookings = bookings_res.scalars().all()
    
    # Load session details for bookings
    allocated_items = []
    for b in bookings:
        session_res = await db.execute(
            select(Session.start_time, Session.activity_type).where(Session.id == b.session_id)
        )
        session_row = session_res.first()
        if session_row:
            session_start, session_activity = session_row
            allocated_items.append({
                "date": session_start.date(),
                "credits": Decimal(b.credits_used) if b.credits_used is not None else Decimal(1),
                "activity_type": session_activity,
            })

    # Sort items chronologically
    allocated_items.sort(key=lambda x: x["date"])

    # 4. Process each order
    for order in orders:
        credits_total = Decimal(order.credits_total or 0)
        if credits_total <= 0:
            continue
            
        target_installments = [inst for inst in order.installments if inst.trigger_consumption_percent is not None]
        if not target_installments:
            continue

        # Simulate FIFO allocation to find the date where each threshold is crossed
        allocated_sum = Decimal(0)
        trigger_dates = {}
        
        # Determine blocked status of order
        today = date.today()
        effective_end = compute_effective_end_date(order.end_date, grace_days, grace_mode)
        norm_status = normalize_status(order.status)
        if norm_status in ["en_pause", "resiliee", "expiree"]:
            is_blocked = True
        elif order.is_blocked is True:
            is_blocked = True
        elif order.is_blocked is False:
            is_blocked = False
        else:
            is_blocked = not order.is_validity_unlimited and effective_end and effective_end < today

        for item in allocated_items:
            item_date = item["date"]
            item_credits = item["credits"]
            
            # Check validity rules
            if is_blocked:
                if norm_status in ["en_pause", "resiliee"] and item_date < today:
                    is_valid = (order.start_date <= item_date)
                else:
                    is_valid = False
            else:
                is_valid = (order.start_date <= item_date) and (order.is_validity_unlimited or not effective_end or item_date <= effective_end)
                
            if is_valid:
                # Check activity restrictions
                allowed_acts = order.offer_snap_allowed_activities or (order.offer.allowed_activities if order.offer else [])
                if allowed_acts:
                    item_act = item.get("activity_type")
                    if not item_act:
                        is_valid = False
                    else:
                        allowed_acts_clean = [a.strip().lower() for a in allowed_acts if a]
                        if item_act.strip().lower() not in allowed_acts_clean:
                            is_valid = False
            
            if is_valid:
                # Allocate credits
                available = credits_total - allocated_sum
                if available > 0:
                    allocated_to_this = min(item_credits, available)
                    allocated_sum += allocated_to_this
                    for inst in target_installments:
                        pct = inst.trigger_consumption_percent
                        if pct not in trigger_dates:
                            threshold_credits = credits_total * (Decimal(pct) / Decimal(100))
                            if allocated_sum >= threshold_credits:
                                trigger_dates[pct] = item_date
                        
        # 5. Update installments
        for inst in target_installments:
            pct = inst.trigger_consumption_percent
            trigger_date = trigger_dates.get(pct)
            if trigger_date is not None:
                # Seuil franchi: fixer la date de l'échéance
                if inst.due_date != trigger_date:
                    should_send_email = (inst.due_date is None)
                    logger.info("Threshold reached: setting installment due date", 
                                order_id=order.id, installment_id=inst.id, due_date=trigger_date, percent=pct)
                    inst.due_date = trigger_date
                    
                    if should_send_email:
                        try:
                            from app.models.models import User
                            from app.services.email_service import EmailService
                            user_res = await db.execute(select(User).where(User.id == user_id))
                            user = user_res.scalar_one_or_none()
                            if user and tenant:
                                await EmailService.send_installment_reminder(user, tenant, order, inst)
                        except Exception as email_err:
                            logger.error("Failed to send installment email reminder", error=str(email_err))
            else:
                # Seuil non franchi ou repassé sous le seuil (suite à annulation)
                # On ne réinitialise que si l'échéance n'est pas encore payée
                if not inst.is_paid and inst.due_date is not None:
                    logger.info("Under threshold: resetting installment due date", 
                                order_id=order.id, installment_id=inst.id, percent=pct)
                    inst.due_date = None
                    
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("Failed to commit threshold installment updates", error=str(e))
        raise
