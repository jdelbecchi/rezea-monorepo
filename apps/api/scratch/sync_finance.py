
import asyncio
import sys
import os

# Add apps/api to path
sys.path.append(os.path.join(os.getcwd(), "apps", "api"))

from uuid import UUID
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Update these to match docker-compose.dev.yml
DATABASE_URL = "postgresql+asyncpg://rezea:rezea_password@127.0.0.1:5433/rezea"

from app.models.models import (
    Order, Installment, OrderPaymentStatus, 
    FinanceTransaction, FinanceTransactionType, FinanceCategory, FinancePaymentMethod
)

async def sync_finance():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        print("Starting Finance Sync...")
        
        # 1. Sync PAID orders (Lump Sum)
        orders_query = select(Order).where(Order.payment_status == OrderPaymentStatus.PAID)
        orders_res = await db.execute(orders_query)
        orders = orders_res.scalars().all()
        
        for order in orders:
            # Check if transaction exists
            tx_query = select(FinanceTransaction).where(FinanceTransaction.order_id == order.id)
            tx_res = await db.execute(tx_query)
            if tx_res.scalar_one_or_none():
                continue
                
            print(f"Creating transaction for PAID Order {order.id} ({order.price_cents} cents)")
            
            # Find category
            cat_query = select(FinanceCategory).where(
                FinanceCategory.tenant_id == order.tenant_id,
                FinanceCategory.name == "Ventes Offres"
            )
            cat = (await db.execute(cat_query)).scalar_one_or_none()
            
            tx = FinanceTransaction(
                tenant_id=order.tenant_id,
                date=order.created_at.date(),
                type=FinanceTransactionType.INCOME,
                category_id=cat.id if cat else None,
                amount_cents=order.price_cents,
                description=f"Paiement Commande #{str(order.id)[:8]}",
                payment_method=FinancePaymentMethod.OTHER,
                order_id=order.id,
                is_reconciled=True
            )
            db.add(tx)
            
        # 2. Sync Paid Installments (Echelonné)
        inst_query = select(Installment).where((Installment.is_paid == True) | (Installment.resolved_at != None))
        inst_res = await db.execute(inst_query)
        installments = inst_res.scalars().all()
        
        for inst in installments:
            tx_query = select(FinanceTransaction).where(
                FinanceTransaction.order_id == inst.order_id,
                FinanceTransaction.amount_cents == inst.amount_cents,
                FinanceTransaction.date == (inst.resolved_at.date() if inst.resolved_at else inst.due_date)
            )
            tx_res = await db.execute(tx_query)
            if tx_res.scalar_one_or_none():
                continue
                
            print(f"Creating transaction for PAID Installment on Order {inst.order_id} ({inst.amount_cents} cents)")
            
            cat_query = select(FinanceCategory).where(
                FinanceCategory.tenant_id == inst.tenant_id,
                FinanceCategory.name == "Ventes Offres"
            )
            cat = (await db.execute(cat_query)).scalar_one_or_none()
            
            tx = FinanceTransaction(
                tenant_id=inst.tenant_id,
                date=(inst.resolved_at.date() if inst.resolved_at else inst.due_date),
                type=FinanceTransactionType.INCOME,
                category_id=cat.id if cat else None,
                amount_cents=inst.amount_cents,
                description=f"Échéance Commande #{str(inst.order_id)[:8]}",
                payment_method=FinancePaymentMethod.OTHER,
                order_id=inst.order_id,
                is_reconciled=True
            )
            db.add(tx)
            
        await db.commit()
        print("Sync Completed Successfully.")

if __name__ == "__main__":
    asyncio.run(sync_finance())
