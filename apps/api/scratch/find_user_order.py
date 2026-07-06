import asyncio
import datetime
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Order, Tenant, User, Offer

async def main():
    async with AsyncSessionLocal() as db:
        query = select(Order).where(
            Order.start_date == datetime.date(2026, 6, 15)
        )
        res = await db.execute(query)
        orders = res.scalars().all()
        
        print(f"Found {len(orders)} orders starting on 2026-06-15")
        for o in orders:
            print(f"Order ID: {o.id}")
            print(f"  tenant_id: {o.tenant_id}")
            print(f"  user_id: {o.user_id}")
            print(f"  offer_id: {o.offer_id}")
            print(f"  start_date: {o.start_date}")
            print(f"  end_date: {o.end_date}")
            print(f"  price_cents: {o.price_cents}")
            print(f"  credits_total: {o.credits_total}")
            print(f"  is_unlimited: {o.is_unlimited}")
            print(f"  payment_status: {o.payment_status}")
            print(f"  status: {o.status}")
            print(f"  offer_snap_allowed_activities: {o.offer_snap_allowed_activities}")
            print(f"  featured_pricing: {o.featured_pricing}")

if __name__ == "__main__":
    asyncio.run(main())
