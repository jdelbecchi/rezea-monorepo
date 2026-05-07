import asyncio
from app.db.session import engine
from sqlalchemy import inspect

async def check():
    async with engine.connect() as conn:
        def get_cols(sync_conn):
            return inspect(sync_conn).get_columns('orders')
        
        columns = await conn.run_sync(get_cols)
        print("Columns in 'orders' table:")
        for c in columns:
            print(f"- {c['name']}")

if __name__ == "__main__":
    asyncio.run(check())
