import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, Booking, Session

async def check_db():
    async with AsyncSessionLocal() as db:
        # 1. Find tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        tenant = result.scalar_one_or_none()
        if not tenant:
            print("Tenant 'mon-club' not found")
            return
        
        print(f"Found tenant: {tenant.name} ({tenant.id})")
        
        # 2. Count bookings
        result = await db.execute(select(Booking).where(Booking.tenant_id == tenant.id))
        bookings = result.scalars().all()
        print(f"Total bookings for tenant: {len(bookings)}")
        
        for b in bookings[:5]:
            print(f"Booking ID: {b.id}, Status: {b.status}, User ID: {b.user_id}, Session ID: {b.session_id}")
            # Check session
            res_s = await db.execute(select(Session).where(Session.id == b.session_id))
            s = res_s.scalar_one_or_none()
            if s:
                print(f"  -> Session: {s.title} on {s.start_time}")
            else:
                print(f"  -> Session NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check_db())
