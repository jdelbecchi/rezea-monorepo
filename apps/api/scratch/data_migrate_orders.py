import asyncio
from app.db.session import engine
from sqlalchemy import text

async def data_migrate():
    async with engine.begin() as conn:
        print("Migrating pricing data from offers to orders for existing records...")
        
        # Update orders by joining with offers
        query = """
            UPDATE orders
            SET 
                featured_pricing = COALESCE(orders.featured_pricing, offers.featured_pricing, 'lump_sum'),
                price_recurring_cents = COALESCE(orders.price_recurring_cents, offers.price_recurring_cents),
                recurring_count = COALESCE(orders.recurring_count, offers.recurring_count),
                period = COALESCE(orders.period, offers.period)
            FROM offers
            WHERE orders.offer_id = offers.id
            AND (orders.featured_pricing IS NULL OR orders.price_recurring_cents IS NULL)
        """
        
        try:
            result = await conn.execute(text(query))
            print(f"Data migration complete. Updated rows.")
        except Exception as e:
            print(f"Error during data migration: {e}")

if __name__ == "__main__":
    import os
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://rezea:rezea_password@localhost:5433/rezea"
    asyncio.run(data_migrate())
