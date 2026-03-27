"""Routes sysadmin — gestion globale des tenants (hors-tenant)"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.models import SysAdmin, Tenant, User
from app.schemas.schemas import (
    SysAdminLogin, SysAdminTokenResponse, SysAdminResponse,
    TenantCreate, TenantResponse
)
from app.core.security import (
    verify_password, create_sysadmin_token, verify_sysadmin_token
)
from app.core.config import settings
import structlog

logger = structlog.get_logger()
router = APIRouter()


async def get_current_sysadmin(request: Request):
    """Dépendance: vérifie que le token est un token sysadmin valide"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sysadmin manquant"
        )
    token = auth_header.split(" ")[1]
    return verify_sysadmin_token(token)


@router.post("/login", response_model=SysAdminTokenResponse)
async def sysadmin_login(
    credentials: SysAdminLogin,
    db: AsyncSession = Depends(get_db)
):
    """Connexion sysadmin (pas de tenant_slug)"""
    result = await db.execute(
        select(SysAdmin).where(SysAdmin.email == credentials.email)
    )
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(credentials.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects"
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )

    access_token = create_sysadmin_token(
        data={"sub": str(admin.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    logger.info("Sysadmin login", sysadmin_id=str(admin.id), email=admin.email)

    return SysAdminTokenResponse(
        access_token=access_token,
        sysadmin_id=admin.id,
    )


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Liste tous les tenants"""
    result = await db.execute(
        select(Tenant).order_by(Tenant.created_at.desc())
    )
    return result.scalars().all()


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_in: TenantCreate,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Crée un nouveau tenant (établissement)"""
    # Vérifier si le slug existe déjà
    result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_in.slug)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce slug est déjà utilisé"
        )

    tenant = Tenant(**tenant_in.model_dump())
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    logger.info("Tenant créé par sysadmin", tenant_id=str(tenant.id), slug=tenant.slug)
    return tenant


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Détails d'un tenant"""
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: str,
    update_data: dict,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Modifier un tenant (activer/désactiver, etc.)"""
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    allowed_fields = {"name", "description", "is_active", "max_users", "max_sessions_per_day"}
    for field, value in update_data.items():
        if field in allowed_fields:
            setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.get("/tenants/{tenant_id}/stats")
async def get_tenant_stats(
    tenant_id: str,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Statistiques d'un tenant (nombre d'utilisateurs, etc.)"""
    result = await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant_id)
    )
    user_count = result.scalar() or 0

    return {"tenant_id": tenant_id, "user_count": user_count}
