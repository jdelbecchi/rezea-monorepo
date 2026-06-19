import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def check_tx():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(FinanceTransaction.id, FinanceTransaction.description, FinanceTransaction.installment_id, FinanceTransaction.order_id))
        print("Transactions in DB:")
        for row in res.all():
            print(f"  ID: {row[0]} | Desc: {row[1]} | InstID: {row[2]} | OrderID: {row[3]}")

if __name__ == "__main__":
    asyncio.run(check_tx())
