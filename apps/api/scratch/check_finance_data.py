import asyncio
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction, FinanceCategory, Installment
from uuid import UUID

async def check_data():
    async with AsyncSessionLocal() as db:
        # Check total transactions
        t_count = await db.execute(select(func.count(FinanceTransaction.id)))
        print(f"Total transactions: {t_count.scalar()}")
        
        # Check transactions by tenant
        t_tenants = await db.execute(select(FinanceTransaction.tenant_id, func.count(FinanceTransaction.id)).group_by(FinanceTransaction.tenant_id))
        for row in t_tenants.all():
            print(f"Tenant {row[0]}: {row[1]} transactions")
            
        # Check installments
        i_count = await db.execute(select(func.count(Installment.id)))
        print(f"Total installments: {i_count.scalar()}")
        
        # Check latest transactions dates
        latest = await db.execute(select(FinanceTransaction.date).order_by(FinanceTransaction.date.desc()).limit(5))
        print("Latest transaction dates:")
        for row in latest.all():
            print(f"  {row[0]}")

if __name__ == "__main__":
    asyncio.run(check_data())
