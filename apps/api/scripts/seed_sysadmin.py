"""
Script pour créer le premier sysadmin en base de données.

Usage:
    python -m scripts.seed_sysadmin
    
Ou avec des paramètres custom:
    SYSADMIN_EMAIL=admin@rezea.app SYSADMIN_PASSWORD=Admin123! python -m scripts.seed_sysadmin
"""
import asyncio
import os
import sys

# Ajouter le répertoire parent au path pour trouver app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine, Base
from app.models.models import SysAdmin
from app.core.security import get_password_hash


async def seed_sysadmin():
    email = os.getenv("SYSADMIN_EMAIL", "admin@rezea.app")
    password = os.getenv("SYSADMIN_PASSWORD", "Admin123!")
    name = os.getenv("SYSADMIN_NAME", "Super Admin")
    
    # Créer les tables si nécessaire
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as session:
        # Vérifier si le sysadmin existe déjà
        result = await session.execute(
            select(SysAdmin).where(SysAdmin.email == email)
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"✅ Sysadmin '{email}' existe déjà (id: {existing.id})")
            return
        
        # Créer le sysadmin
        admin = SysAdmin(
            email=email,
            hashed_password=get_password_hash(password),
            name=name,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        
        print(f"✅ Sysadmin créé avec succès!")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print(f"   ID: {admin.id}")


if __name__ == "__main__":
    asyncio.run(seed_sysadmin())
