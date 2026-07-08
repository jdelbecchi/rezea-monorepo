"""
Gestion des sessions de base de données avec SQLAlchemy async
"""
import contextvars
from typing import AsyncGenerator, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

from app.core.config import settings

from sqlalchemy import text

# ContextVar pour stocker le tenant_id de la requête en cours
tenant_context: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar("tenant_context", default=None)

# Création du moteur async
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    poolclass=NullPool if settings.ENVIRONMENT == "test" else None,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base pour les modèles
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dépendance FastAPI pour obtenir une session DB
    
    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        t_id = tenant_context.get()
        if t_id:
            await set_tenant_context(session, str(t_id))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            # Nettoyage du contexte pour éviter les fuites si la connexion est réutilisée
            if t_id:
                try:
                    await session.execute(text("RESET app.current_tenant"))
                except Exception:
                    pass
            await session.close()


async def set_tenant_context(session: AsyncSession, tenant_id: str):
    """
    Configure le contexte tenant pour Row-Level Security
    
    Args:
        session: Session SQLAlchemy
        tenant_id: ID du tenant à définir
    """
    await session.execute(
        text("SET LOCAL app.current_tenant = :tenant_id"),
        {"tenant_id": tenant_id}
    )
