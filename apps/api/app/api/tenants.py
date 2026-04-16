"""Routes tenants"""
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.session import get_db
from app.models.models import Tenant, User, UserRole
from app.schemas.schemas import TenantResponse, TenantCreate, TenantSettingsUpdate

router = APIRouter()


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_in: TenantCreate,
    db: AsyncSession = Depends(get_db)
):
    """Crée un nouveau tenant"""
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
    return tenant


@router.get("/current", response_model=TenantResponse)
async def get_current_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Récupère le tenant courant"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Établissement non trouvé"
        )
    
    return tenant


@router.patch("/current/settings", response_model=TenantResponse)
async def update_tenant_settings(
    settings_in: TenantSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Met à jour les paramètres visuels du tenant (admin club uniquement)"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    
    # Vérifier que l'utilisateur est admin
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs du club"
        )
    
    # Récupérer le tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Établissement non trouvé"
        )
    
    # Appliquer les modifications
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)
    
    await db.commit()
    await db.refresh(tenant)
    return tenant

@router.get("/by-slug/{slug}", response_model=TenantResponse)
async def get_tenant_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    """Récupère un tenant par son slug (Public)"""
    result = await db.execute(
        select(Tenant).where(Tenant.slug == slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Établissement non trouvé"
        )
    return tenant
@router.get("/search", response_model=List[TenantResponse])
async def search_tenants(
    q: str = Query("", min_length=0),
    db: AsyncSession = Depends(get_db)
):
    """Recherche des établissements par nom ou par slug (Public)"""
    if not q:
        # Si pas de recherche, on peut retourner une liste par défaut ou vide
        # Ici je retourne les 10 premiers pour l'init de la recherche
        result = await db.execute(select(Tenant).limit(10))
        return result.scalars().all()
        
    query = select(Tenant).where(
        or_(
            Tenant.name.ilike(f"%{q}%"),
            Tenant.slug.ilike(f"%{q}%")
        )
    ).limit(20)
    
    result = await db.execute(query)
    return result.scalars().all()
