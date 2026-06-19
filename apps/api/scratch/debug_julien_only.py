import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Order, User, Offer, Installment, EventRegistration

async def debug_julien():
    async with AsyncSessionLocal() as db:
        # Check Julien's orders
        res = await db.execute(
            select(Order, User, Offer)
            .join(User, Order.user_id == User.id)
            .join(Offer, Order.offer_id == Offer.id)
            .where(User.first_name == "Julien")
        )
        print("Julien's Orders:")
        for o, u, offer in res.all():
            print(f"  Order {o.id} | Offer: {offer.name} | Price: {o.price_cents} | Status: {o.payment_status} | Created: {o.created_at}")
            
        # Check installments for these orders
        res = await db.execute(
            select(Installment)
            .join(Order, Installment.order_id == Order.id)
            .join(User, Order.user_id == User.id)
            .where(User.first_name == "Julien")
        )
        print("\nJulien's Installments:")
        for inst in res.scalars().all():
            print(f"  Inst {inst.id} | Order: {inst.order_id} | Paid: {inst.is_paid} | Date: {inst.due_date}")

        # Check Julien's event registrations
        res = await db.execute(
            select(EventRegistration, User)
            .join(User, EventRegistration.user_id == User.id)
            .where(User.first_name == "Julien")
        )
        print("\nJulien's Event Registrations:")
        for reg, u in res.all():
            print(f"  Reg {reg.id} | Status: {reg.payment_status} | Price: {reg.price_paid_cents}")

if __name__ == "__main__":
    asyncio.run(debug_julien())
