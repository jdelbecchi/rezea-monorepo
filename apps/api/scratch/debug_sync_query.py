import asyncio
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal
from app.models.models import Order, Installment, OrderPaymentStatus

async def debug_query():
    async with AsyncSessionLocal() as db:
        tenant_id = "818653af-1fa8-44b4-8563-3b0c2ea12c80"
        
        # Test the query
        order_query = (
            select(Order)
            .outerjoin(Installment, Order.id == Installment.order_id)
            .where(
                Order.tenant_id == tenant_id,
                Order.payment_status == OrderPaymentStatus.PAID,
                Installment.id == None
            )
        )
        res = await db.execute(order_query)
        orders = res.scalars().all()
        print(f"Orders found with outerjoin + None: {len(orders)}")
        for o in orders:
            print(f"  Order {o.id} | Price: {o.price_cents}")
            
        # Try another way
        alt_query = (
            select(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.payment_status == OrderPaymentStatus.PAID
            )
        )
        res = await db.execute(alt_query)
        all_paid = res.scalars().all()
        print(f"\nAll PAID orders for tenant: {len(all_paid)}")
        for o in all_paid:
            # Manually check installments
            i_res = await db.execute(select(func.count(Installment.id)).where(Installment.order_id == o.id))
            count = i_res.scalar()
            print(f"  Order {o.id} | Price: {o.price_cents} | Installment count: {count}")

if __name__ == "__main__":
    asyncio.run(debug_query())
