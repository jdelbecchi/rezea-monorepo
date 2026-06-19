
import asyncio
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.models.models import User, Tenant, Order, Booking, Session, Event, EventRegistration

async def diagnose():
    async with AsyncSessionLocal() as db:
        print("--- DIAGNOSTIC DATA REZEA ---")
        
        # 1. Check Tenants
        res = await db.execute(select(Tenant))
        tenants = res.scalars().all()
        print(f"\n[TENANTS] Total: {len(tenants)}")
        for t in tenants:
            print(f" - {t.name} (Slug: {t.slug}) ID: {t.id}")
            
        # Focus on 'mon-club'
        res = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        club = res.scalar_one_or_none()
        if not club:
            print("\n!!! ERROR: 'mon-club' not found !!!")
            return
            
        t_id = club.id
        print(f"\n[FOCUS] Analyzing 'mon-club' ({t_id})")
        
        # 2. Check Users
        res = await db.execute(select(func.count(User.id)).where(User.tenant_id == t_id))
        user_count = res.scalar()
        print(f" - Users: {user_count}")
        
        # 3. Check Base Data (Sessions/Events)
        res = await db.execute(select(func.count(Session.id)).where(Session.tenant_id == t_id))
        session_count = res.scalar()
        res = await db.execute(select(func.min(Session.start_time), func.max(Session.start_time)).where(Session.tenant_id == t_id))
        s_min, s_max = res.fetchone()
        
        res = await db.execute(select(func.count(Event.id)).where(Event.tenant_id == t_id))
        event_count = res.scalar()
        print(f" - Sessions: {session_count} (From {s_min} to {s_max})")
        print(f" - Events: {event_count}")
        
        # 4. Check Transactional Data
        res = await db.execute(select(func.count(Order.id)).where(Order.tenant_id == t_id))
        order_count = res.scalar()
        res = await db.execute(select(func.min(Order.created_at)).where(Order.tenant_id == t_id))
        o_min = res.scalar()
        
        res = await db.execute(select(func.count(Booking.id)).where(Booking.tenant_id == t_id))
        booking_count = res.scalar()
        print(f" - Orders: {order_count} (Earliest: {o_min})")
        print(f" - Bookings: {booking_count}")
        
        # 5. Check for ORPHAN data (other tenant_id or NULL)
        res = await db.execute(select(func.count(Order.id)).where(Order.tenant_id != t_id))
        orphan_orders = res.scalar()
        print(f"\n[ORPHANS] Orders with different tenant_id: {orphan_orders}")
        
        if order_count == 0 and orphan_orders > 0:
            print("!!! WARNING: Orders exist but belong to a different tenant ID !!!")

if __name__ == "__main__":
    import os
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://rezea:rezea_password@127.0.0.1:5433/rezea"
    try:
        asyncio.run(diagnose())
    except Exception as e:
        print(f"\n[CRITICAL] Could not connect to DB: {e}")
