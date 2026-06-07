import asyncio
import os
from sqlalchemy import text
from app.db.session import engine

async def fix_free_payments():
    # Fallback to localhost if running outside Docker container
    if "DATABASE_URL" not in os.environ:
        os.environ["DATABASE_URL"] = "postgresql+asyncpg://rezea:rezea_password@localhost:5433/rezea"
    
    async with engine.connect() as conn:
        # Check orders with price_cents = 0 and payment_status in ('a_valider', 'en_attente')
        result_orders = await conn.execute(
            text("SELECT id, price_cents, payment_status FROM orders WHERE price_cents = 0 AND payment_status IN ('a_valider', 'en_attente')")
        )
        orders_to_fix = result_orders.all()
        print(f"Found {len(orders_to_fix)} orders with price 0 and pending/waiting status.")
        for o in orders_to_fix:
            print(f"- Order ID: {o.id}, Status: {o.payment_status}")
            
        # Check event registrations with price_paid_cents = 0 and payment_status in ('a_valider', 'en_attente')
        result_regs = await conn.execute(
            text("SELECT id, price_paid_cents, payment_status FROM event_registrations WHERE price_paid_cents = 0 AND payment_status IN ('a_valider', 'en_attente')")
        )
        regs_to_fix = result_regs.all()
        print(f"Found {len(regs_to_fix)} event registrations with price 0 and pending/waiting status.")
        for r in regs_to_fix:
            print(f"- Registration ID: {r.id}, Status: {r.payment_status}")
            
        # Update orders
        if orders_to_fix:
            update_orders = await conn.execute(
                text("UPDATE orders SET payment_status = 'paye' WHERE price_cents = 0 AND payment_status IN ('a_valider', 'en_attente')")
            )
            print(f"Updated {update_orders.rowcount} orders to 'paye'.")
            
        # Update registrations
        if regs_to_fix:
            update_regs = await conn.execute(
                text("UPDATE event_registrations SET payment_status = 'paye' WHERE price_paid_cents = 0 AND payment_status IN ('a_valider', 'en_attente')")
            )
            print(f"Updated {update_regs.rowcount} event registrations to 'paye'.")
            
        await conn.commit()
        print("Database update committed successfully.")

if __name__ == "__main__":
    asyncio.run(fix_free_payments())
