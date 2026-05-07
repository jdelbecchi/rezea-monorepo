import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, User, Booking

async def check_user_tenant():
    async with AsyncSessionLocal() as db:
        # 1. Find tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        tenant = result.scalar_one_or_none()
        if not tenant:
            print("Tenant 'mon-club' not found")
            return
        
        print(f"Tenant ID: {tenant.id}")
        
        # 2. Find users for this tenant
        result = await db.execute(select(User).where(User.tenant_id == tenant.id))
        users = result.scalars().all()
        print(f"Users found: {len(users)}")
        for u in users:
            print(f"User: {u.email}, ID: {u.id}, Role: {u.role}, Tenant ID: {u.tenant_id}")
            
        # 3. Check bookings
        result = await db.execute(select(Booking).where(Booking.tenant_id == tenant.id))
        bookings = result.scalars().all()
        print(f"Bookings found: {len(bookings)}")

if __name__ == "__main__":
    asyncio.run(check_user_tenant())
