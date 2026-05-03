
import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Event, EventRegistration, User

async def check_registrations():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@monclub.fr"))
        user = result.scalar_one_or_none()
        if not user:
            print("User not found")
            return

        print(f"User ID: {user.id}")
        
        result = await db.execute(
            select(EventRegistration, Event.title)
            .join(Event)
            .where(EventRegistration.user_id == user.id)
        )
        regs = result.all()
        
        if not regs:
            print("No event registrations found for this user.")
        else:
            for reg, title in regs:
                print(f"Registration: ID={reg.id}, Event='{title}', Status={reg.status}, Tenant={reg.tenant_id}")

if __name__ == "__main__":
    asyncio.run(check_registrations())
