import asyncio
import json
import httpx
from uuid import UUID

async def test_api_as_frontend():
    # Simulate the frontend request
    # 1. Get a token (we'll assume we have one or use a skip-auth approach for diagnostic)
    url = "http://localhost:8000/api/admin/bookings"
    headers = {
        "X-Tenant-Slug": "mon-club",
        "Authorization": "Bearer YOUR_TOKEN_HERE" # This is the tricky part
    }
    
    # We can't easily get the token here, but we can check the database again 
    # and specifically look for what list_bookings does
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.models import Booking, Tenant
    from sqlalchemy.orm import joinedload

    async with AsyncSessionLocal() as db:
        # Resolve tenant
        res = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        tenant = res.scalar_one()
        t_id = tenant.id
        
        # Exact query from admin_bookings.py
        query = (
            select(Booking)
            .where(Booking.tenant_id == t_id)
            .options(joinedload(Booking.session), joinedload(Booking.user))
        )
        
        result = await db.execute(query)
        bookings = result.unique().scalars().all()
        
        print(f"API MOCK: Found {len(bookings)} bookings for tenant_id {t_id}")
        for b in bookings:
            print(f" - Booking {b.id}, User: {b.user.last_name if b.user else 'N/A'}, Session: {b.session.title if b.session else 'N/A'}")

if __name__ == "__main__":
    asyncio.run(test_api_as_frontend())
