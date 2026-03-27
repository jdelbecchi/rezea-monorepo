"""
Script pour créer des données de test : établissement + utilisateurs.

Usage:
    cd apps/api && python -m scripts.seed_testdata
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, text
from app.db.session import AsyncSessionLocal, engine, Base
from app.models.models import Tenant, User, UserRole, CreditAccount
from app.core.security import get_password_hash


async def seed_testdata():
    # 1) Mettre à jour le schéma (ajouter les nouvelles colonnes si besoin)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Ajouter les colonnes manuellement si la table existait déjà
        for col, col_type, default in [
            ("banner_url", "VARCHAR(500)", None),
            ("primary_color", "VARCHAR(7)", "'#7c3aed'"),
            ("welcome_message", "VARCHAR(500)", None),
        ]:
            try:
                if default:
                    await conn.execute(text(
                        f"ALTER TABLE tenants ADD COLUMN IF NOT EXISTS {col} {col_type} DEFAULT {default}"
                    ))
                else:
                    await conn.execute(text(
                        f"ALTER TABLE tenants ADD COLUMN IF NOT EXISTS {col} {col_type}"
                    ))
            except Exception:
                pass  # Column already exists

    print("✅ Schéma mis à jour")

    async with AsyncSessionLocal() as session:
        # 2) Créer l'établissement de test
        slug = "mon-club"
        result = await session.execute(
            select(Tenant).where(Tenant.slug == slug)
        )
        tenant = result.scalar_one_or_none()

        if not tenant:
            tenant = Tenant(
                name="Mon Club",
                slug=slug,
                description="Établissement sportif de test",
            )
            session.add(tenant)
            await session.commit()
            await session.refresh(tenant)
            print(f"✅ Établissement créé: {tenant.name} (slug: {tenant.slug})")
        else:
            print(f"✅ Établissement existant: {tenant.name} (slug: {tenant.slug})")

        # 3) Créer les utilisateurs de test
        test_users = [
            {
                "email": "admin@monclub.fr",
                "first_name": "Admin",
                "last_name": "Club",
                "role": UserRole.OWNER,
                "password": "Test1234!",
            },
            {
                "email": "membre@monclub.fr",
                "first_name": "Julien",
                "last_name": "Membre",
                "role": UserRole.USER,
                "password": "Test1234!",
            },
        ]

        for u in test_users:
            result = await session.execute(
                select(User).where(
                    User.email == u["email"],
                    User.tenant_id == tenant.id,
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                print(f"  ℹ️  {u['role'].value:8s} {u['email']} existe déjà")
                continue

            user = User(
                tenant_id=tenant.id,
                email=u["email"],
                hashed_password=get_password_hash(u["password"]),
                first_name=u["first_name"],
                last_name=u["last_name"],
                role=u["role"],
                is_active=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)

            # Créer un compte de crédits
            credit_account = CreditAccount(
                tenant_id=tenant.id,
                user_id=user.id,
                balance=10,
                total_purchased=10,
                total_used=0,
            )
            session.add(credit_account)
            await session.commit()

            print(f"  ✅ {u['role'].value:8s} {u['email']} créé (10 crédits)")

    print()
    print("=" * 50)
    print("  IDENTIFIANTS DE TEST")
    print("=" * 50)
    print()
    print("🛡️  Sysadmin:")
    print("    URL:   http://localhost:3000/sysadmin/login")
    print("    Email: admin@rezea.app")
    print("    MdP:   Admin123!")
    print()
    print("👔 Admin du club:")
    print("    URL:   http://localhost:3000/login")
    print("    Slug:  mon-club")
    print("    Email: admin@monclub.fr")
    print("    MdP:   Test1234!")
    print()
    print("👤 Membre:")
    print("    URL:   http://localhost:3000/login")
    print("    Slug:  mon-club")
    print("    Email: membre@monclub.fr")
    print("    MdP:   Test1234!")
    print()


if __name__ == "__main__":
    asyncio.run(seed_testdata())
