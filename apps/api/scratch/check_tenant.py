
import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Tenant, EventRegistration

async def run():
    async with AsyncSessionLocal() as db:
        reg_id = '057946f2-0265-4ce0-8ced-f037802bb360'
        reg = (await db.execute(select(EventRegistration).where(EventRegistration.id == reg_id))).scalar_one_or_none()
        if not reg:
            print("Reg not found")
            return
        t = (await db.execute(select(Tenant).where(Tenant.id == reg.tenant_id))).scalar_one_or_none()
        print(f"Slug: {t.slug if t else 'Not found'}")

if __name__ == "__main__":
    asyncio.run(run())
