import asyncio
from app.db.session import AsyncSessionLocal
from app.api.finance import sync_revenues_to_finance
from uuid import UUID

async def manual_sync():
    async with AsyncSessionLocal() as db:
        tenant_id = UUID("818653af-1fa8-44b4-8563-3b0c2ea12c80")
        print(f"Running manual sync for tenant {tenant_id}")
        await sync_revenues_to_finance(db, tenant_id)
        print("Sync finished.")

if __name__ == "__main__":
    asyncio.run(manual_sync())
