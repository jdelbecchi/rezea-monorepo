import asyncio
from sqlalchemy import select, delete, or_
from app.db.session import AsyncSessionLocal
from app.models.models import FinanceTransaction

async def cleanup():
    async with AsyncSessionLocal() as db:
        # On supprime les transactions qui ont l'ancien format de description ET pas d'installment_id
        # Cela permettra au nouveau sync de les recréer proprement avec le lien installment_id
        query = (
            delete(FinanceTransaction)
            .where(
                FinanceTransaction.installment_id == None,
                or_(
                    FinanceTransaction.description.like("Échéance Commande #%"),
                    FinanceTransaction.description.like("Paiement Commande #%")
                )
            )
        )
        res = await db.execute(query)
        print(f"Deleted {res.rowcount} old orphaned transactions.")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(cleanup())
