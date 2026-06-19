import asyncio
import json
from httpx import AsyncClient
from app.core.security import create_access_token
from app.db.database import async_session
from app.models.models import Tenant, FinanceTransaction
from sqlalchemy import select

async def main():
    async with async_session() as db:
        tenant_res = await db.execute(select(Tenant).limit(1))
        tenant = tenant_res.scalar()
        
        trans_res = await db.execute(select(FinanceTransaction).where(FinanceTransaction.tenant_id == tenant.id).limit(1))
        trans = trans_res.scalar()
        
    token = create_access_token({"sub": "test", "tenant_id": str(tenant.id), "role": "owner"})
    
    payload = {
        "date": "2026-05-02",
        "type": "income",
        "category_id": None,
        "amount_cents": 1000,
        "vat_amount_cents": 0,
        "vat_rate": 0,
        "description": "Inscription Portes Ouvertes - Julien Membre",
        "payment_method": "other",
        "account_id": None
    }
    
    async with AsyncClient(base_url="http://localhost:8000") as client:
        response = await client.patch(
            f"/api/admin/finance/transactions/{trans.id}",
            json=payload,
            headers={"Authorization": f"Bearer {token}", "X-Tenant-Slug": tenant.slug}
        )
        print("Status:", response.status_code)
        print("Response:", response.text)

asyncio.run(main())
