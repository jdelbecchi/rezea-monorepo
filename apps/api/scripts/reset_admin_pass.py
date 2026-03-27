
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import User
from app.core.security import get_password_hash

async def reset_password():
    async with AsyncSessionLocal() as session:
        # Check both possible emails
        for email in ["admin@mon-club.fr", "admin@monclub.fr"]:
            result = await session.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()
            if user:
                user.hashed_password = get_password_hash("Test1234!")
                await session.commit()
                print(f"✅ Mot de passe réinitialisé pour {email} (pass: Test1234!)")
            else:
                print(f"❌ Utilisateur {email} non trouvé")

if __name__ == "__main__":
    asyncio.run(reset_password())
