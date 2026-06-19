import asyncio
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Tenant))
        tenants = res.scalars().all()
        if not tenants:
            print("No tenants found in the database.")
        for t in tenants:
            print(f"Name: {t.name} | Slug: {t.slug} | ID: {t.id}")

if __name__ == "__main__":
    asyncio.run(main())
