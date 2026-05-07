import asyncio
import os
from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.asyncio import create_async_engine

# Connection string (adjust if needed, usually in .env or hardcoded in dev)
# Looking at common patterns in this repo
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/rezea"

async def check_db():
    try:
        engine = create_async_engine(DATABASE_URL)
        async with engine.connect() as conn:
            print("Successfully connected to the database.")
            
        # Sync inspection for columns
        sync_url = DATABASE_URL.replace("+asyncpg", "")
        sync_engine = create_engine(sync_url)
        inspector = inspect(sync_engine)
        
        tables = ["tenants", "orders", "users"]
        for table in tables:
            print(f"\nColumns in '{table}':")
            columns = inspector.get_columns(table)
            for col in columns:
                print(f" - {col['name']} ({col['type']})")
                
    except Exception as e:
        print(f"Error connecting to DB: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
