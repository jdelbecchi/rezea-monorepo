import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Connection string from .env
# We try localhost with port 5433 (mapped in docker-compose.dev.yml)
DATABASE_URL = "postgresql+asyncpg://rezea:rezea_password@localhost:5433/rezea"

async def run_migration():
    migration_file = r"c:\Users\jdemo\rezea-monorepo\apps\api\migrations\004_add_legal_info.sql"
    
    if not os.path.exists(migration_file):
        print(f"Migration file not found: {migration_file}")
        return

    with open(migration_file, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        engine = create_async_engine(DATABASE_URL)
        async with engine.begin() as conn:
            print("Connected. Running migration...")
            # Split by ; to run multiple statements if needed, but text() can often handle multiple
            # However, some drivers prefer single statements. Let's try splitting.
            statements = sql.split(";")
            for stmt in statements:
                s = stmt.strip()
                if s:
                    await conn.execute(text(s))
                    print(f"Executed: {s[:50]}...")
            print("Migration completed successfully.")
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    asyncio.run(run_migration())
