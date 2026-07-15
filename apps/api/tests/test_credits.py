import pytest
from datetime import date, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import Order, Tenant, User, Offer, Booking, BookingStatus, OrderPaymentStatus
from app.services.orders import compute_fifo_balances, sync_user_credit_balance

@pytest.mark.asyncio
async def test_manual_block_does_not_cancel_future_bookings(db_session: AsyncSession):
    # 1. Create a Tenant
    tenant = Tenant(
        name="Test Tenant",
        slug="test-tenant",
        grace_period_days=0,
        grace_period_mode="days"
    )
    db_session.add(tenant)
    await db_session.flush()

    # 2. Create a User
    user = User(
        tenant_id=tenant.id,
        first_name="Laura",
        last_name="Hugo",
        email="laura.hugo@example.com",
        hashed_password="hashed_password",
        is_active=True
    )
    db_session.add(user)
    await db_session.flush()

    # 3. Create an Offer
    offer = Offer(
        tenant_id=tenant.id,
        name="C10 - P",
        offer_code="C10-P",
        is_validity_unlimited=False,
        validity_days=30,
        classes_included=10,
        price_lump_sum_cents=1000,
    )
    db_session.add(offer)
    await db_session.flush()

    # 4. Create an Order (C10 - P)
    order = Order(
        tenant_id=tenant.id,
        user_id=user.id,
        offer_id=offer.id,
        start_date=date.today() - timedelta(days=5),
        end_date=date.today() + timedelta(days=25),
        is_validity_unlimited=False,
        credits_total=10,
        is_unlimited=False,
        price_cents=1000,
        payment_status=OrderPaymentStatus.PAID,
        status="active",
        is_blocked=None
    )
    db_session.add(order)
    await db_session.flush()

    # 5. Create a past Booking and a future Booking
    # For bookings, we need a Session object. Let's import Session from models.
    from app.models.models import Session as SportsSession
    
    now = datetime.utcnow()
    session_past = SportsSession(
        tenant_id=tenant.id,
        title="Past Session",
        activity_type="Yoga",
        start_time=now - timedelta(days=2),
        end_time=now - timedelta(days=2) + timedelta(hours=1),
        max_participants=10
    )
    session_future = SportsSession(
        tenant_id=tenant.id,
        title="Future Session",
        activity_type="Yoga",
        start_time=now + timedelta(days=5),
        end_time=now + timedelta(days=5) + timedelta(hours=1),
        max_participants=10
    )
    db_session.add(session_past)
    db_session.add(session_future)
    await db_session.flush()

    booking_past = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_past.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    booking_future = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_future.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    db_session.add(booking_past)
    db_session.add(booking_future)
    await db_session.flush()

    # Sync and verify initial state: 2 credits used, balance = 8
    await sync_user_credit_balance(db_session, user.id, tenant.id)
    
    # Reload bookings to check status
    await db_session.refresh(booking_past)
    await db_session.refresh(booking_future)
    assert booking_past.status == BookingStatus.CONFIRMED
    assert booking_future.status == BookingStatus.CONFIRMED

    # 6. NOW: Block the order manually
    order.is_blocked = True
    await db_session.flush()

    # Sync and check: future booking should NOT be cancelled!
    await sync_user_credit_balance(db_session, user.id, tenant.id)
    await db_session.refresh(booking_past)
    await db_session.refresh(booking_future)
    
    # The past booking must remain CONFIRMED
    assert booking_past.status == BookingStatus.CONFIRMED
    # The future booking must also remain CONFIRMED because it's a manual block
    assert booking_future.status == BookingStatus.CONFIRMED

    # 7. NOW: Change the order status to "en_pause" (automatic blocking status)
    order.is_blocked = None
    order.status = "en_pause"
    await db_session.flush()

    # Sync and check: future booking MUST be cancelled now!
    await sync_user_credit_balance(db_session, user.id, tenant.id)
    await db_session.refresh(booking_past)
    await db_session.refresh(booking_future)

    # Past booking remains CONFIRMED
    assert booking_past.status == BookingStatus.CONFIRMED
    # Future booking must be CANCELLED
    assert booking_future.status == BookingStatus.CANCELLED


@pytest.mark.asyncio
async def test_multi_activity_pack_credits(db_session: AsyncSession):
    # 1. Create a Tenant
    tenant = Tenant(
        name="Multi Tenant",
        slug="multi-tenant",
        grace_period_days=0,
        grace_period_mode="days",
        activity_types=["Yoga", "CrossFit", "Entrainement libre"]
    )
    db_session.add(tenant)
    await db_session.flush()

    # 2. Create a User
    user = User(
        tenant_id=tenant.id,
        first_name="Max",
        last_name="Power",
        email="max.power@example.com",
        hashed_password="hashed_password",
        is_active=True
    )
    db_session.add(user)
    await db_session.flush()

    # 3. Create a Pack Offer (1 Yoga, 2 CrossFit)
    offer = Offer(
        tenant_id=tenant.id,
        name="Pack Yoga/CrossFit",
        offer_code="PACK-Y-C",
        is_validity_unlimited=True,
        classes_included=3,
        price_lump_sum_cents=3000,
        allowed_activities=["Yoga", "CrossFit"],
        activity_credits={"Yoga": 1, "CrossFit": 2}
    )
    db_session.add(offer)
    await db_session.flush()

    # 4. Create an Order from this Offer
    order = Order(
        tenant_id=tenant.id,
        user_id=user.id,
        offer_id=offer.id,
        start_date=date.today() - timedelta(days=5),
        is_validity_unlimited=True,
        credits_total=3,
        activity_credits={"Yoga": 1, "CrossFit": 2},
        offer_snap_activity_credits={"Yoga": 1, "CrossFit": 2},
        is_unlimited=False,
        price_cents=3000,
        payment_status=OrderPaymentStatus.PAID,
        status="active"
    )
    db_session.add(order)
    await db_session.flush()

    # 5. Create bookings to consume:
    # 1 past Yoga session, 1 future CrossFit session, 1 other future CrossFit session (consuming total CrossFit credits)
    from app.models.models import Session as SportsSession
    now = datetime.utcnow()
    session_y = SportsSession(
        tenant_id=tenant.id,
        title="Yoga session",
        activity_type="Yoga",
        start_time=now - timedelta(days=1),
        end_time=now - timedelta(days=1) + timedelta(hours=1),
        max_participants=10
    )
    session_c1 = SportsSession(
        tenant_id=tenant.id,
        title="CrossFit 1",
        activity_type="CrossFit",
        start_time=now + timedelta(days=1),
        end_time=now + timedelta(days=1) + timedelta(hours=1),
        max_participants=10
    )
    session_c2 = SportsSession(
        tenant_id=tenant.id,
        title="CrossFit 2",
        activity_type="CrossFit",
        start_time=now + timedelta(days=2),
        end_time=now + timedelta(days=2) + timedelta(hours=1),
        max_participants=10
    )
    # Extra session that should NOT be funded (exceeds CrossFit limit of 2)
    session_c3 = SportsSession(
        tenant_id=tenant.id,
        title="CrossFit 3",
        activity_type="CrossFit",
        start_time=now + timedelta(days=3),
        end_time=now + timedelta(days=3) + timedelta(hours=1),
        max_participants=10
    )
    db_session.add_all([session_y, session_c1, session_c2, session_c3])
    await db_session.flush()

    booking_y = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_y.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    booking_c1 = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_c1.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    booking_c2 = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_c2.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    booking_c3 = Booking(
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_c3.id,
        status=BookingStatus.CONFIRMED,
        credits_used=1
    )
    db_session.add_all([booking_y, booking_c1, booking_c2, booking_c3])
    await db_session.flush()

    # Sync and verify:
    # y, c1, c2 should remain CONFIRMED
    # c3 should be CANCELLED because it exceeds the CrossFit credits balance of 2
    await sync_user_credit_balance(db_session, user.id, tenant.id)
    
    await db_session.refresh(booking_y)
    await db_session.refresh(booking_c1)
    await db_session.refresh(booking_c2)
    await db_session.refresh(booking_c3)

    assert booking_y.status == BookingStatus.CONFIRMED
    assert booking_c1.status == BookingStatus.CONFIRMED
    assert booking_c2.status == BookingStatus.CONFIRMED
    assert booking_c3.status == BookingStatus.CANCELLED

    # Check the return value of compute_fifo_balances directly
    orders_balances, global_balance, success, balances_by_activity, global_frozen, frozen_by_activity = await compute_fifo_balances(
        db_session, user.id, tenant.id
    )
    # Remaining Yoga balance should be 0, CrossFit balance should be 0
    assert balances_by_activity.get("Yoga") == 0
    assert balances_by_activity.get("CrossFit") == 0
