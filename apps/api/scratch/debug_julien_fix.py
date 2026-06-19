import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Order, User, Offer, Installment, EventRegistration

async def debug_julien_fix():
    async with AsyncSessionLocal() as db:
        # 1. Check for 540€ order
        res = await db.execute(
            select(Order, Offer)
            .join(Offer, Order.offer_id == Offer.id)
            .where(Order.price_cents == 54000)
        )
        print("540€ Orders:")
        for o, offer in res.all():
            print(f"  Order {o.id} | Offer: {offer.name} | Status: {o.payment_status} | Echelonné: {o.featured_pricing}")
            
        # 2. Check Portes Ouvertes registrations for Julien
        res = await db.execute(
            select(EventRegistration)
            .join(User, EventRegistration.user_id == User.id)
            .where(User.first_name == "Julien")
        )
        print("\nJulien's Registrations:")
        for reg in res.scalars().all():
            print(f"  Reg {reg.id} | EventID: {reg.event_id} | Status: {reg.payment_status}")

if __name__ == "__main__":
    asyncio.run(debug_julien_fix())
