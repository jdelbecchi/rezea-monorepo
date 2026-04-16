"""
Shared Order Service
Centralizes status calculation, response building and database normalization.
"""
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Order, Offer, Booking, BookingStatus, OrderPaymentStatus
from app.schemas.schemas import OrderResponse

def compute_end_date(offer: Offer, start_date: date) -> Optional[date]:
    """Calculates the end date based on the offer. Returns None if unlimited."""
    if offer.is_validity_unlimited:
        return None
    if offer.validity_days:
        if offer.validity_unit == "months":
            return start_date + relativedelta(months=offer.validity_days)
        return start_date + timedelta(days=offer.validity_days)
    if offer.deadline_date:
        return offer.deadline_date
    # Fallback: 1 year
    return start_date + timedelta(days=365)

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

def build_order_response(order: Order, credits_used: int) -> OrderResponse:
    """
    Builds the OrderResponse with calculated balance and dynamic status.
    This logic MUST be shared between Admin and User Shop APIs.
    """
    balance = None
    if not order.is_unlimited and order.credits_total is not None:
        balance = order.credits_total - credits_used
    
    # Logic: use manual status if present, otherwise calculate automatic one
    today = date.today()
    display_status = order.status
    
    has_credits = order.is_unlimited or (balance is not None and balance > 0)
    is_past = not order.is_validity_unlimited and order.end_date and order.end_date < today

    if display_status in ["en_pause", "resiliee"]:
        # Keep it as is
        pass
    elif not has_credits:
        display_status = "termine"
    elif is_past:
        display_status = "expiree"
    else:
        # Default fallback for "active", "en_cours" or missing values
        display_status = "active"

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
        created_by_admin=order.created_by_admin,
        created_at=order.created_at,
        updated_at=order.updated_at,
        invoice_number=order.invoice_number,
        invoice_url=order.invoice_url,
        user_name=f"{order.user.first_name} {order.user.last_name}" if order.user else "Utilisateur supprimé",
        user_email=order.user.email if (order.user and order.user.email) else "",
        user_is_suspended=order.user.is_suspended if order.user else False,
        offer_code=order.offer.offer_code if order.offer else "",
        offer_name=order.offer.name if order.offer else (order.offer_snap_name or "Offre inconnue"),
        offer_period=order.offer.period if order.offer else None,
        offer_featured_pricing=order.offer.featured_pricing if order.offer else None,
        offer_price_recurring_cents=order.offer.price_recurring_cents if order.offer else None,
        offer_price_lump_sum_cents=order.offer.price_lump_sum_cents if order.offer else None,
        offer_recurring_count=order.offer.recurring_count if order.offer else None,
        credits_used=credits_used,
        balance=balance,
        status=display_status,
        received_cents=received_cents,
        pending_cents=pending_cents,
        error_cents=error_cents,
        # Snapshots
        offer_snap_name=order.offer_snap_name,
        offer_snap_description=order.offer_snap_description,
        offer_snap_validity_days=order.offer_snap_validity_days,
        offer_snap_validity_unit=order.offer_snap_validity_unit,
        offer_snap_is_validity_unlimited=order.offer_snap_is_validity_unlimited or False,
        installments=order.installments
    )
