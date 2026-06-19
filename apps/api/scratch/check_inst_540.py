import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import Installment

async def check_inst_540():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Installment).where(Installment.order_id == "59e52e97-2c93-43d6-9012-0213cf971203"))
        insts = res.scalars().all()
        print(f"Installments for order 59e52e97: {len(insts)}")
        for i in insts:
            print(f"  Inst {i.id} | Paid: {i.is_paid} | Amount: {i.amount_cents}")

if __name__ == "__main__":
    asyncio.run(check_inst_540())
