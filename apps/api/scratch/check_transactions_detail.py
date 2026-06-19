import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def check_transactions():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(FinanceTransaction.type, FinanceTransaction.amount_cents, FinanceTransaction.date))
        print("Transactions:")
        for row in res.all():
            print(f"  {row[0]} - {row[1]} cents - {row[2]}")

if __name__ == "__main__":
    asyncio.run(check_transactions())
