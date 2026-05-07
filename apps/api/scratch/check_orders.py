import asyncio
from app.db.session import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT id, price_cents, featured_pricing FROM orders"))
        rows = result.all()
        print(f"Found {len(rows)} orders:")
        for r in rows:
            print(f"- ID: {r.id}, Price: {r.price_cents}, Pricing: {r.featured_pricing}")

if __name__ == "__main__":
    import os
    # Ensure we use the correct port
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://rezea:rezea_password@localhost:5433/rezea"
    asyncio.run(check())
