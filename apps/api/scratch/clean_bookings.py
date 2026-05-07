import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import select, delete
from app.models.models import Booking, Tenant
from uuid import UUID

async def clean_corrupted_bookings():
    async with AsyncSessionLocal() as db:
        # Resolve tenant
        res = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        tenant = res.scalar_one()
        t_id = tenant.id
        
        # 1. Find bookings for this tenant
        result = await db.execute(select(Booking).where(Booking.tenant_id == t_id))
        bookings = result.scalars().all()
        
        print(f"Checking {len(bookings)} bookings for tenant {t_id}...")
        
        to_delete = []
        for b in bookings:
            # Check if user or session is missing (corruption)
            if not b.user_id or not b.session_id or not b.status:
                print(f" - Found corrupted booking: {b.id} (Missing IDs or status)")
                to_delete.append(b.id)
                continue
            
            # Check if they are orphans (no longer in DB)
            # This is harder without a full check but we can at least check for NULLs
            
        if to_delete:
            print(f"Deleting {len(to_delete)} corrupted records...")
            await db.execute(delete(Booking).where(Booking.id.in_(to_delete)))
            await db.commit()
            print("Cleanup complete.")
        else:
            print("No obvious corruption found via NULL IDs. Checking for Pydantic-breaking NULLs...")
            # Check for credits_used or created_at
            res_nulls = await db.execute(
                select(Booking).where(
                    Booking.tenant_id == t_id,
                    (Booking.credits_used == None) | (Booking.created_at == None)
                )
            )
            null_bookings = res_nulls.scalars().all()
            if null_bookings:
                print(f"Found {len(null_bookings)} bookings with NULL credits or dates. Deleting...")
                for b in null_bookings:
                    await db.delete(b)
                await db.commit()
            else:
                print("No NULL values found in required fields.")

if __name__ == "__main__":
    asyncio.run(clean_corrupted_bookings())
