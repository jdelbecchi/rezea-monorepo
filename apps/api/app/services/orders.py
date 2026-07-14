"""
Shared Order Service
Centralizes status calculation, response building and database normalization.
"""
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Order, Offer, Booking, BookingStatus, OrderPaymentStatus, Tenant, CreditAccount, CreditTransaction, CreditTransactionType
from app.schemas.schemas import OrderResponse

def compute_end_date(offer: Offer, start_date: date) -> Optional[date]:
    """Calculates the end date based on the offer. Returns None if unlimited."""
    if offer.is_validity_unlimited:
        return None
    if offer.validity_days:
        return start_date + timedelta(days=offer.validity_days)
    if offer.deadline_date:
        return offer.deadline_date
    # Fallback: 1 year
    return start_date + timedelta(days=365)

def compute_effective_end_date(end_date: Optional[date], grace_period_days: int = 0, grace_period_mode: str = "days") -> Optional[date]:
    """Calculates the end date after applying the tenant's grace period/tolerance configuration."""
    if not end_date:
        return None
    if grace_period_mode == "end_of_month":
        import calendar
        last_day = calendar.monthrange(end_date.year, end_date.month)[1]
        return date(end_date.year, end_date.month, last_day)
    elif grace_period_mode == "days" and grace_period_days > 0:
        return end_date + timedelta(days=grace_period_days)
    return end_date

def normalize_status(status_str: Optional[str]) -> Optional[str]:
    """Normalizes statuses to avoid duplicates and handle legacy naming."""
    if not status_str:
        return None
    s = status_str.strip()
    lower_s = s.lower()
    
    # Standard mappings
    if lower_s in ["en cours", "en_cours", "encours", "active"]:
        return "active"
    if lower_s in ["termine", "terminé", "terminée", "terminé ", "termine "]:
        return "termine"
    if lower_s in ["expire", "expiré", "expirée", "expiree"]:
        return "expiree"
    if lower_s in ["pause", "en pause", "en_pause"]:
        return "en_pause"
    if lower_s in ["resilie", "resilié", "resiliée", "resiliee", "annule", "annulé", "annulée", "cancel", "cancelled"]:
        return "resiliee"
    
    return s

async def compute_credits_used(db: AsyncSession, user_id, tenant_id, start_date: date, end_date: Optional[date]) -> int:
    """Counts credits consumed by confirmed/completed bookings in the period."""
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

def build_order_response(
    order: Order, 
    credits_used: int, 
    global_balance: Optional[float] = None, 
    global_credits_used: Optional[int] = None,
    grace_period_days: int = 0,
    grace_period_mode: str = "days",
    is_blocked_val: Optional[bool] = None
) -> OrderResponse:
    """
    Builds the OrderResponse with calculated balance and dynamic status.
    This logic MUST be shared between Admin and User Shop APIs.
    """
    balance = global_balance
    if balance is None and not order.is_unlimited and order.credits_total is not None:
        balance = order.credits_total - credits_used
    
    # Use global_credits_used if provided, else fall back to the order-specific one
    effective_credits_used = global_credits_used if global_credits_used is not None else credits_used
    
    # Logic: use manual status if present, otherwise calculate automatic one
    today = date.today()
    display_status = order.status
    
    has_credits = order.is_unlimited or (balance is not None and balance > 0)
    effective_end_date = compute_effective_end_date(order.end_date, grace_period_days, grace_period_mode)
    is_past = not order.is_validity_unlimited and effective_end_date and effective_end_date < today
    
    blocked = (order.is_blocked is True) or (is_past and order.is_blocked is not False)
    if display_status in ["en_pause", "resiliee"]:
        blocked = True
        
    effective_blocked = is_blocked_val if is_blocked_val is not None else blocked

    if display_status and display_status not in ["active", "expiree", "termine"]:
        # Tout statut autre que "active", "expiree" ou "termine" est considéré comme un choix manuel 
        # ou un état figé que l'on ne recalculcule pas automatiquement (ex: resiliee, en_pause).
        pass
    elif is_past:
        if balance == 0:
            display_status = "termine"
        else:
            display_status = "expiree"
    else:
        # L'ordre reste "active" ou le devient s'il n'avait pas de statut
        display_status = "active"

    normalized_status = normalize_status(display_status)
    if normalized_status in ["en_pause", "resiliee", "expiree"]:
        effective_blocked = True
    elif order.is_blocked is True:
        effective_blocked = True
    elif order.is_blocked is False:
        effective_blocked = False
    else: # order.is_blocked is None
        effective_blocked = is_blocked_val if is_blocked_val is not None else blocked



    # Installments status logic
    # Perçu = J+7 passés (non erreur) OR resolved_at
    # À venir = J+7 futurs (non erreur)
    # Impayés = is_error (non résolu)
    
    received_cents = 0
    pending_cents = 0
    error_cents = 0
    
    for inst in order.installments:
        amount = int(inst.amount_cents)
        if hasattr(inst, 'is_error') and inst.is_error and not (hasattr(inst, 'resolved_at') and inst.resolved_at):
            error_cents += amount
        elif (hasattr(inst, 'is_paid') and inst.is_paid) or (hasattr(inst, 'resolved_at') and inst.resolved_at) or (inst.due_date + timedelta(days=7) <= today):
            received_cents += amount
        else:
            pending_cents += amount

    # If the order is NOT installment/issue, it might be a lump sum
    if order.payment_status == OrderPaymentStatus.PAID:
        received_cents = order.price_cents
        pending_cents = 0
    elif order.payment_status in [OrderPaymentStatus.WAITING, OrderPaymentStatus.PENDING]:
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
        user_note=order.user_note,
        created_by_admin=order.created_by_admin,
        created_at=order.created_at,
        updated_at=order.updated_at,
        invoice_number=order.invoice_number or f"REC-{str(order.id)[-6:].upper()}",
        invoice_url=order.invoice_url,
        is_blocked=effective_blocked,
        is_exported=order.is_exported,
        user_name=f"{order.user.first_name} {order.user.last_name}" if order.user else "Utilisateur supprimé",
        user_email=order.user.email if (order.user and order.user.email) else "",
        user_is_suspended=order.user.is_suspended if order.user else False,
        user_street=order.user.street if order.user else None,
        user_zip_code=order.user.zip_code if order.user else None,
        user_city=order.user.city if order.user else None,
        offer_code=order.offer_snap_code or (order.offer.offer_code if order.offer else ""),
        offer_name=order.offer_snap_name or (order.offer.name if order.offer else "Offre inconnue"),
        offer_period=order.period,
        offer_featured_pricing=order.featured_pricing,
        offer_price_recurring_cents=order.price_recurring_cents,
        offer_price_lump_sum_cents=order.price_cents if order.featured_pricing == "lump_sum" else None,
        offer_recurring_count=order.recurring_count,
        credits_used=effective_credits_used,
        balance=balance,
        status=display_status,
        received_cents=received_cents,
        pending_cents=pending_cents,
        error_cents=error_cents,
        # Snapshots
        offer_snap_name=order.offer_snap_name,
        offer_snap_code=order.offer_snap_code,
        offer_snap_description=order.offer_snap_description,
        offer_snap_validity_days=order.offer_snap_validity_days,
        offer_snap_validity_unit=order.offer_snap_validity_unit,
        offer_snap_is_validity_unlimited=order.offer_snap_is_validity_unlimited or False,
        allowed_activities=(
            order.offer_snap_allowed_activities 
            if getattr(order, 'offer_snap_allowed_activities', None) is not None 
            else (order.offer.allowed_activities if order.offer else [])
        ),
        limit_amount=order.limit_amount,
        limit_period=order.limit_period,
        limit_rollover=order.limit_rollover,
        offer_snap_limit_amount=order.offer_snap_limit_amount,
        offer_snap_limit_period=order.offer_snap_limit_period,
        offer_snap_limit_rollover=order.offer_snap_limit_rollover,
        installments=order.installments
    )


async def expire_user_credits_if_needed(db: AsyncSession, user_id, tenant_id):
    """
    Checks all expired orders of the user.
    If they have remaining credits, deducts them from CreditAccount.balance
    and creates a CreditTransaction of type ADJUSTMENT.
    Also restores credits if an order was extended/unexpired.
    """
    # 1. Fetch Tenant configuration for grace period
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"
    
    # 2. Get all orders for this user that are not unlimited
    orders_res = await db.execute(
        select(Order)
        .where(
            and_(
                Order.user_id == user_id,
                Order.tenant_id == tenant_id,
                Order.is_validity_unlimited == False,
                Order.end_date.isnot(None)
            )
        )
    )
    orders = orders_res.scalars().all()
    today = date.today()
    
    # Get user's CreditAccount
    account_res = await db.execute(
        select(CreditAccount).where(
            and_(
                CreditAccount.user_id == user_id,
                CreditAccount.tenant_id == tenant_id
            )
        )
    )
    account = account_res.scalar_one_or_none()
    if not account:
        return
        
    for order in orders:
        effective_end_date = compute_effective_end_date(order.end_date, grace_days, grace_mode)
        is_past = effective_end_date and effective_end_date < today
        
        # Check if an expiration transaction already exists for this order
        exp_tx_res = await db.execute(
            select(CreditTransaction).where(
                and_(
                    CreditTransaction.tenant_id == tenant_id,
                    CreditTransaction.account_id == account.id,
                    CreditTransaction.transaction_type == CreditTransactionType.ADJUSTMENT,
                    CreditTransaction.reference == str(order.id)
                )
            )
        )
        exp_tx = exp_tx_res.scalar_one_or_none()
        
        if is_past:
            # Order is expired! If not processed yet, process it.
            if not exp_tx:
                # Calculate unused credits for this order
                credits_used = await compute_credits_used(db, user_id, tenant_id, order.start_date, order.end_date)
                order_credits_total = order.credits_total or 0
                unused = order_credits_total - credits_used
                if unused > 0:
                    amount_to_deduct = min(Decimal(unused), Decimal(account.balance))
                    if amount_to_deduct > 0:
                        account.balance -= amount_to_deduct
                        tx = CreditTransaction(
                            tenant_id=tenant_id,
                            account_id=account.id,
                            transaction_type=CreditTransactionType.ADJUSTMENT,
                            amount=-amount_to_deduct,
                            balance_after=account.balance,
                            description=f"Expiration des crédits ({order.offer_snap_name or 'Offre'})",
                            reference=str(order.id),
                            consumed_at=datetime.utcnow()
                        )
                        db.add(tx)
                        
                        # Also, if order status is active or None, change it to expiree
                        if order.status in ["active", None]:
                            order.status = "expiree"
                            
                        try:
                            await db.commit()
                        except Exception:
                            await db.rollback()
                            raise
        else:
            # Order is NOT past (active or extended/unexpired).
            # If an expiration transaction exists, it means the order was extended/restored!
            if exp_tx:
                # Restituer les crédits
                amount_to_restore = abs(float(exp_tx.amount))
                account.balance += amount_to_restore
                
                # Delete the expiration transaction to clean up
                await db.delete(exp_tx)
                
            if order.status == "expiree":
                order.status = "active"
                
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise


async def compute_fifo_balances(
    db: AsyncSession, 
    user_id, 
    tenant_id, 
    bookings_to_add: list = [],
    exclude_booking_id = None,
    return_unfunded_ids: bool = False
):
    """
    Calculates remaining credits for each order of the user using FIFO.
    Allocates bookings chronologically based on their session/event date.
    Returns:
      - orders_balances: dict mapping order_id -> {
            "credits_total": int,
            "credits_used": int,
            "balance": int,
            "frozen": int,
            "is_blocked": bool
        }
      - global_balance: sum of balances of all active/non-blocked orders of the user.
      - success: bool (whether all bookings, including bookings_to_add, were successfully allocated)
      - balances_by_activity: dict of activity -> available_balance
      - global_frozen: sum of frozen credits of the user
      - frozen_by_activity: dict of activity -> frozen_balance
    """
    from datetime import date, datetime
    from decimal import Decimal
    from app.models.models import Order, Booking, Session, Tenant, BookingStatus
    
    # 1. Get grace period parameters
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    grace_days = tenant.grace_period_days if tenant else 0
    grace_mode = tenant.grace_period_mode if tenant else "days"
    
    from sqlalchemy.orm import selectinload
    # 2. Load all orders of the user, ordered by start_date ascending, then created_at
    orders_res = await db.execute(
        select(Order)
        .where(
            and_(
                Order.user_id == user_id,
                Order.tenant_id == tenant_id
            )
        )
        .options(selectinload(Order.offer))
        .order_by(Order.start_date.asc(), Order.created_at.asc())
    )
    orders = orders_res.scalars().all()
    
    # 3. Load all existing bookings of the user (confirmed, completed, and active pending waitlist entries)
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
    
    # Let's build the list of all allocations:
    # Each item: {"id": uuid, "date": date, "credits": Decimal, "activity_type": str, "is_pending": bool}
    items_to_allocate = []
    for b in bookings:
        if exclude_booking_id and b.id == exclude_booking_id:
            continue
        # Get session start date and activity type
        session_res = await db.execute(
            select(Session.start_time, Session.activity_type).where(Session.id == b.session_id)
        )
        session_row = session_res.first()
        if session_row:
            session_start, session_activity = session_row
            items_to_allocate.append({
                "id": str(b.id),
                "date": session_start.date(),
                "credits": Decimal(b.credits_used) if b.credits_used is not None else Decimal(1),
                "activity_type": session_activity,
                "is_pending": b.status == BookingStatus.PENDING
            })
            
    # Add temporary bookings (to validate new booking request)
    for temp in bookings_to_add:
        items_to_allocate.append({
            "id": temp.get("id"),
            "date": temp.get("date"),
            "credits": Decimal(temp.get("credits", 1)),
            "activity_type": temp.get("activity_type"),
            "is_pending": temp.get("is_pending", False)
        })
        
    # Sort all items to allocate by date ascending
    items_to_allocate.sort(key=lambda x: x["date"])
    
    # Initialize allocation tracker for each order
    # order_allocations maps str(order.id) -> credits_allocated
    order_allocations = {str(o.id): Decimal(0) for o in orders}
    order_frozen_allocations = {str(o.id): Decimal(0) for o in orders}
    
    # Determine which orders are blocked *today*
    today = date.today()
    orders_blocked_status = {}
    for o in orders:
        effective_end = compute_effective_end_date(o.end_date, grace_days, grace_mode)
        is_past = not o.is_validity_unlimited and effective_end and effective_end < today
        
        # Determine if blocked: status has absolute priority, then manual override
        norm_status = normalize_status(o.status)
        if norm_status in ["en_pause", "resiliee", "expiree"]:
            blocked = True
        elif o.is_blocked is True:
            blocked = True
        elif o.is_blocked is False:
            blocked = False
        else: # o.is_blocked is None
            blocked = is_past
            
        orders_blocked_status[str(o.id)] = blocked
        
    # Now simulate the allocation
    success = True
    unallocated_booking_ids = []
    for item in items_to_allocate:
        allocated = False
        item_date = item["date"]
        item_credits = item["credits"]
        
        # Try to find a valid order for this item
        for o in orders:
            o_id = str(o.id)
            effective_end = compute_effective_end_date(o.end_date, grace_days, grace_mode)
            
            # Check if order is valid at the item's date
            is_blocked = orders_blocked_status[o_id]
            norm_status = normalize_status(o.status)
            if is_blocked:
                # Only Pause and Resign statuses allow past bookings to consume credits.
                # Expired or manually blocked orders remain strictly blocked for all bookings.
                if norm_status in ["en_pause", "resiliee"] and item_date < today:
                    is_valid = (o.start_date <= item_date)
                else:
                    is_valid = False
            elif o.is_blocked is False:
                is_valid = (o.start_date <= item_date) and (o.is_validity_unlimited or not effective_end or item_date <= effective_end)
            else: # o.is_blocked is None
                is_valid = (o.start_date <= item_date) and (o.is_validity_unlimited or not effective_end or item_date <= effective_end)

                
            # Check if order's activity restrictions allow this item's activity
            if is_valid:
                allowed_acts = []
                if hasattr(o, 'offer_snap_allowed_activities') and isinstance(o.offer_snap_allowed_activities, list) and o.offer_snap_allowed_activities is not None:
                    allowed_acts = o.offer_snap_allowed_activities
                elif o.offer and isinstance(o.offer.allowed_activities, list):
                    allowed_acts = o.offer.allowed_activities
                
                item_act = item.get("activity_type")
                if allowed_acts:
                    if not item_act:
                        is_valid = False
                    else:
                        allowed_acts_clean = [a.strip().lower() for a in allowed_acts if a]
                        if item_act.strip().lower() not in allowed_acts_clean:
                            is_valid = False
                
            # If valid, do we have enough remaining credits?
            if is_valid:
                # Unlimited credits orders have infinite capacity
                if o.is_unlimited:
                    allocated = True
                    item_credits = Decimal(0)
                    break
                else:
                    credits_init = Decimal(o.credits_total or 0)
                    credits_used = order_allocations[o_id]
                    if credits_used < credits_init:
                        # Allocate as much as possible
                        available = credits_init - credits_used
                        if item_credits <= available:
                            order_allocations[o_id] += item_credits
                            if item.get("is_pending"):
                                order_frozen_allocations[o_id] += item_credits
                            item_credits = Decimal(0)
                            allocated = True
                            break
                        else:
                            order_allocations[o_id] += available
                            if item.get("is_pending"):
                                order_frozen_allocations[o_id] += available
                            item_credits -= available
                            # continue to next order for remaining item_credits
                            
        if item_credits > 0 and not allocated:
            success = False
            if item.get("id") and item["id"] != "new_booking":
                unallocated_booking_ids.append(item["id"])
            
    # Compute balances for each order & balances by activity
    orders_balances = {}
    global_balance = Decimal(0)
    global_frozen = Decimal(0)
    balances_by_activity = {}
    frozen_by_activity = {}
    
    for o in orders:
        o_id = str(o.id)
        credits_init = Decimal(o.credits_total or 0)
        credits_used = order_allocations[o_id]
        frozen_used = order_frozen_allocations[o_id]
        
        if o.is_unlimited:
            bal = None
            froz_bal = Decimal(0)
        else:
            bal = max(Decimal(0), credits_init - credits_used)
            froz_bal = frozen_used
            
        is_blocked = orders_blocked_status[o_id]
        
        # Sum to global_balance and global_frozen if NOT blocked and NOT unlimited
        if not is_blocked and bal is not None:
            global_balance += bal
            global_frozen += froz_bal
            
        orders_balances[o_id] = {
            "credits_total": o.credits_total,
            "credits_used": credits_used,
            "balance": bal,
            "frozen": froz_bal,
            "is_blocked": is_blocked
        }
        
        # Compute balances by activity
        if not is_blocked:
            allowed_acts = []
            if hasattr(o, 'offer_snap_allowed_activities') and isinstance(o.offer_snap_allowed_activities, list) and o.offer_snap_allowed_activities is not None:
                allowed_acts = o.offer_snap_allowed_activities
            elif o.offer and isinstance(o.offer.allowed_activities, list):
                allowed_acts = o.offer.allowed_activities
            
            label = ", ".join(allowed_acts) if allowed_acts else "Toutes activités"
            if label not in balances_by_activity:
                balances_by_activity[label] = None if o.is_unlimited else Decimal(0)
            if label not in frozen_by_activity:
                frozen_by_activity[label] = Decimal(0)
            
            if balances_by_activity[label] is not None:
                if o.is_unlimited:
                    balances_by_activity[label] = None
                else:
                    balances_by_activity[label] += Decimal(bal)
            
            frozen_by_activity[label] += Decimal(froz_bal)
            
    if return_unfunded_ids:
        return orders_balances, global_balance, success, balances_by_activity, global_frozen, frozen_by_activity, unallocated_booking_ids
    return orders_balances, global_balance, success, balances_by_activity, global_frozen, frozen_by_activity


async def sync_user_credit_balance(db: AsyncSession, user_id, tenant_id):
    """
    Recalculates the user's credit balance using compute_fifo_balances
    and updates/creates their CreditAccount record.
    Also automatically cancels future bookings that are no longer funded by any active order.
    """
    # 1. Recalculate FIFO balances and get unallocated booking IDs (only future ones)
    res = await compute_fifo_balances(db, user_id, tenant_id, return_unfunded_ids=True)
    orders_balances, global_balance, success, balances_by_activity, global_frozen, frozen_by_activity, unallocated_ids = res
    
    # 2. Cancel any unfunded bookings that are in the future
    if unallocated_ids:
        from app.models.models import Booking, Session, BookingStatus
        from sqlalchemy.orm import joinedload
        
        # Load these specific bookings
        b_res = await db.execute(
            select(Booking)
            .options(joinedload(Booking.session))
            .where(
                and_(
                    Booking.id.in_(unallocated_ids),
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING])
                )
            )
        )
        unfunded_bookings = b_res.scalars().all()
        
        now = datetime.utcnow()
        for b in unfunded_bookings:
            if b.session and b.session.start_time >= now:
                was_confirmed = b.status == BookingStatus.CONFIRMED
                was_pending = b.status == BookingStatus.PENDING
                
                b.status = BookingStatus.CANCELLED
                b.cancelled_at = now
                b.cancellation_type = "system"
                
                if was_confirmed:
                    b.session.current_participants = max(0, b.session.current_participants - 1)
                elif was_pending:
                    b.session.waitlist_count = max(0, b.session.waitlist_count - 1)
                    
                # Promote the next pending booking on the waitlist
                if was_confirmed:
                    next_res = await db.execute(
                        select(Booking)
                        .where(
                            and_(
                                Booking.tenant_id == tenant_id,
                                Booking.session_id == b.session_id,
                                Booking.status == BookingStatus.PENDING
                            )
                        )
                        .order_by(Booking.created_at.asc())
                        .limit(1)
                    )
                    next_b = next_res.scalar_one_or_none()
                    if next_b:
                        next_b.status = BookingStatus.CONFIRMED
                        b.session.current_participants += 1
                        b.session.waitlist_count = max(0, b.session.waitlist_count - 1)
        
        # Recalculate global balance now that unfunded bookings are cancelled
        _, global_balance, _, _, _, _ = await compute_fifo_balances(db, user_id, tenant_id)
        
    # Fetch or create CreditAccount
    result = await db.execute(
        select(CreditAccount).where(
            and_(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == user_id
            )
        )
    )
    account = result.scalar_one_or_none()
    
    if not account:
        account = CreditAccount(
            tenant_id=tenant_id,
            user_id=user_id,
            balance=global_balance,
            total_purchased=global_balance,
            total_used=0
        )
        db.add(account)
    else:
        account.balance = global_balance
    
    await db.flush()



