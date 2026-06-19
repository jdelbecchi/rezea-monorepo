
import asyncio
from sqlalchemy import select
from app.core.config import settings
settings.DATABASE_URL = "postgresql+asyncpg://rezea:rezea_password@localhost:5433/rezea"

from app.db.session import AsyncSessionLocal
from app.models.models import User, Tenant

async def check_user():
    async with AsyncSessionLocal() as db:
        # Check all users
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"Total Users: {len(users)}")
        for u in users:
            print(f"User: {u.email} (ID: {u.id}) - Role: {u.role} - TenantID: {u.tenant_id}")
        
        # Check all tenants
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        print(f"\nTotal Tenants: {len(tenants)}")
        for t in tenants:
            print(f"Tenant: {t.name} (Slug: {t.slug}) - ID: {t.id}")

if __name__ == "__main__":
    asyncio.run(check_user())
