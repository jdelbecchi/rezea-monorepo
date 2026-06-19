import asyncio
from sqlalchemy import select, delete
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def deduplicate():
    async with AsyncSessionLocal() as db:
        # 1. Deduplicate by registration_id
        res = await db.execute(select(FinanceTransaction.registration_id).where(FinanceTransaction.registration_id != None).group_by(FinanceTransaction.registration_id).having(select(FinanceTransaction.registration_id).group_by(FinanceTransaction.registration_id).count() > 1))
        # Wait, SQLAlchemy group_by count is complex. I'll just do it in python.
        
        all_tx = await db.execute(select(FinanceTransaction).where(FinanceTransaction.registration_id != None))
        by_reg = {}
        for tx in all_tx.scalars().all():
            if tx.registration_id not in by_reg:
                by_reg[tx.registration_id] = []
            by_reg[tx.registration_id].append(tx)
            
        deleted = 0
        for reg_id, txs in by_reg.items():
            if len(txs) > 1:
                print(f"Found {len(txs)} transactions for registration {reg_id}. Keeping the first one.")
                for tx_to_del in txs[1:]:
                    await db.delete(tx_to_del)
                    deleted += 1
        
        # 2. Same for installment_id
        all_tx_inst = await db.execute(select(FinanceTransaction).where(FinanceTransaction.installment_id != None))
        by_inst = {}
        for tx in all_tx_inst.scalars().all():
            if tx.installment_id not in by_inst:
                by_inst[tx.installment_id] = []
            by_inst[tx.installment_id].append(tx)
            
        for inst_id, txs in by_inst.items():
            if len(txs) > 1:
                print(f"Found {len(txs)} transactions for installment {inst_id}. Keeping the first one.")
                for tx_to_del in txs[1:]:
                    await db.delete(tx_to_del)
                    deleted += 1
                    
        print(f"Deduplicated {deleted} transactions.")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(deduplicate())
