import asyncio
from sqlalchemy import select, delete, or_
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def cleanup_more():
    async with AsyncSessionLocal() as db:
        # On supprime les transactions "Inscription" qui n'ont pas de registration_id
        # (probablement créées manuellement ou par une ancienne version)
        query = (
            delete(FinanceTransaction)
            .where(
                FinanceTransaction.registration_id == None,
                FinanceTransaction.description.like("Inscription %")
            )
        )
        res = await db.execute(query)
        print(f"Deleted {res.rowcount} old orphaned inscriptions.")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(cleanup_more())
