import asyncio
from app.db.session import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        print("Adding missing columns to 'orders' table...")
        
        # Add columns if they don't exist
        # We use a try-except block for each or check existence if possible
        # In Postgres, we can use ALTER TABLE ... ADD COLUMN IF NOT EXISTS
        
        queries = [
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS price_recurring_cents INTEGER",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS recurring_count INTEGER",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS featured_pricing VARCHAR(20) DEFAULT 'lump_sum'",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS period VARCHAR(50)"
        ]
        
        for query in queries:
            try:
                await conn.execute(text(query))
                print(f"Executed: {query}")
            except Exception as e:
                print(f"Error executing {query}: {e}")
        
        print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
