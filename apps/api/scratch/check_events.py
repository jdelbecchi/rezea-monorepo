import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Event

async def check_events():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Event.id, Event.title))
        print("Events:")
        for row in res.all():
            print(f"  {row[0]} | Title: {row[1]}")

if __name__ == "__main__":
    asyncio.run(check_events())
