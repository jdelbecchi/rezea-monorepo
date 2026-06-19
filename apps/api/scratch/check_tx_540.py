import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def check_tx_540():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(FinanceTransaction).where(FinanceTransaction.order_id == "59e52e97-2c93-43d6-9012-0213cf971203"))
        txs = res.scalars().all()
        print(f"Transactions for order 59e52e97: {len(txs)}")
        for t in txs:
            print(f"  TX {t.id} | Desc: {t.description} | InstID: {t.installment_id} | Amount: {t.amount_cents}")

if __name__ == "__main__":
    asyncio.run(check_tx_540())
