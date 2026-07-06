import asyncio
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal
from app.models.models import Order, Offer, User

async def main():
    async with AsyncSessionLocal() as db:
        query = select(Order).options(joinedload(Order.user), joinedload(Order.offer)).order_by(Order.created_at.desc())
        res = await db.execute(query)
        orders = res.unique().scalars().all()
        
        print(f"Dump of all orders:")
        for o in orders:
            offer_name = o.offer.name if o.offer else "N/A"
            print(f"Order: {o.offer_snap_name or offer_name} (ID: {o.id})")
            print(f"  User: {o.user.email if o.user else 'N/A'}")
            print(f"  offer_snap_allowed_activities: {o.offer_snap_allowed_activities}")
            print(f"  offer.allowed_activities: {o.offer.allowed_activities if o.offer else 'N/A'}")
            print(f"  payment_status: {o.payment_status}")
            print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())
