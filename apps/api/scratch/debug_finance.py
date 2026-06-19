import asyncio
from sqlalchemy import select, func, extract
from app.db.database import async_session
from app.models.models import FinanceTransaction, FinanceTransactionType, Tenant
from datetime import date

async def main():
    async with async_session() as db:
        tenant_res = await db.execute(select(Tenant).limit(1))
        tenant = tenant_res.scalar()
        if not tenant:
            print("No tenant")
            return
            
        print("Tenant ID:", tenant.id)
        
        target_start_date = date(2026, 5, 1)
        target_end_date = date(2026, 5, 31)
        
        query = (
            select(
                FinanceTransaction.type,
                func.sum(FinanceTransaction.amount_cents)
            )
            .where(
                FinanceTransaction.tenant_id == tenant.id,
                FinanceTransaction.date >= target_start_date,
                FinanceTransaction.date <= target_end_date
            )
            .group_by(FinanceTransaction.type)
        )
        
        res = await db.execute(query)
        print("Query Results:", res.all())

        all_tx_query = select(FinanceTransaction.date, FinanceTransaction.amount_cents, FinanceTransaction.type).where(FinanceTransaction.tenant_id == tenant.id)
        res_all = await db.execute(all_tx_query)
        print("All TXs:", res_all.all())

if __name__ == "__main__":
    asyncio.run(main())
