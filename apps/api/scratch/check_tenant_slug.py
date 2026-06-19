import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant

async def check_tenant():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Tenant.id).where(Tenant.slug == "mon-club"))
        tenant = res.scalar_one_or_none()
        print(f"Tenant ID for 'mon-club': {tenant}")

if __name__ == "__main__":
    asyncio.run(check_tenant())
