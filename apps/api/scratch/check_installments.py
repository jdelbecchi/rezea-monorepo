import asyncio
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.models.models import Installment
from datetime import date

async def check_installments():
    async with AsyncSessionLocal() as db:
        today = date.today()
        print(f"Today: {today}")
        
        # All installments
        res = await db.execute(select(Installment.due_date, Installment.is_paid, Installment.is_error).order_by(Installment.due_date))
        print("Installments:")
        for row in res.all():
            status = "PAID" if row[1] else "ERROR" if row[2] else "PENDING"
            print(f"  {row[0]} - {status}")

if __name__ == "__main__":
    asyncio.run(check_installments())
