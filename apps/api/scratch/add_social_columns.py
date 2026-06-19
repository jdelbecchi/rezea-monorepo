import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def add_columns():
    print("Connecting to database...")
    async with AsyncSessionLocal() as db:
        # Add website_url column
        print("Adding website_url...")
        await db.execute(text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);"))
        
        # Add facebook_url column
        print("Adding facebook_url...")
        await db.execute(text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500);"))
        
        # Add instagram_url column
        print("Adding instagram_url...")
        await db.execute(text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500);"))
        
        await db.commit()
        print("Database schema successfully updated with social media columns!")

if __name__ == "__main__":
    asyncio.run(add_columns())
