import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import EventRegistration, User, Event

async def check_all_regs():
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(EventRegistration, User, Event)
            .join(User, EventRegistration.user_id == User.id)
            .join(Event, EventRegistration.event_id == Event.id)
        )
        print("All Registrations:")
        for reg, u, e in res.all():
            print(f"  Reg {reg.id} | User: {u.first_name} | Event: {e.title} | Status: {reg.payment_status}")

if __name__ == "__main__":
    asyncio.run(check_all_regs())
