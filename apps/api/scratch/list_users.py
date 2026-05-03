
import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import User

async def list_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"User: {u.first_name} {u.last_name} ({u.email}) Role={u.role}")

if __name__ == "__main__":
    asyncio.run(list_users())
