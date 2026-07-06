import asyncio
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal
from app.models.models import Order
from app.services import orders as order_service

async def main():
    async with AsyncSessionLocal() as db:
        query = select(Order).options(joinedload(Order.offer), joinedload(Order.installments), joinedload(Order.user)).where(Order.offer_id.is_not(None))
        res = await db.execute(query)
        orders = res.unique().scalars().all()
        
        for order in orders:
            print(f"Order: {order.offer_snap_name}")
            resp = order_service.build_order_response(
                order, 
                credits_used=0, 
                global_balance=1,
                global_credits_used=0,
                grace_period_days=0,
                grace_period_mode="days",
                is_blocked_val=False
            )
            print(f"Serialized allowed_activities: {resp.allowed_activities}")
            print(f"Serialized dict keys: {resp.model_dump().keys()}")
            print(f"offer_snap_allowed_activities: {order.offer_snap_allowed_activities}")
            print(f"offer: {order.offer}")
            if order.offer:
                print(f"offer.allowed_activities: {order.offer.allowed_activities}")

if __name__ == "__main__":
    asyncio.run(main())
