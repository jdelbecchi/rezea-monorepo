import asyncio
from uuid import UUID
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.models.models import User, Tenant
from app.api.admin_users import get_segment_user_ids, attach_user_segments

DATABASE_URL = "postgresql+asyncpg://rezea:rezea_password@postgres:5432/rezea"

async def main():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # Get mon-club tenant
        res = await db.execute(select(Tenant).where(Tenant.slug == "mon-club"))
        tenant = res.scalar()
        if not tenant:
            print("Tenant 'mon-club' not found!")
            return
            
        print(f"Checking segments for tenant {tenant.name} ({tenant.id})")
        
        # Get users
        res = await db.execute(select(User).where(User.tenant_id == tenant.id))
        users = res.scalars().all()
        
        # Attach segments
        await attach_user_segments(db, tenant.id, users)
        
        print("\n--- RESULTS ---")
        for u in users:
            print(f"User: {u.first_name} {u.last_name} | Role: {u.role} | Segment: {u.segment}")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
