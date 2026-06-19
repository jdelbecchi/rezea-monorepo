import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceCategory

async def check_cats():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(FinanceCategory.name))
        print("Categories:")
        for row in res.all():
            print(f"  {row[0]}")

if __name__ == "__main__":
    asyncio.run(check_cats())
