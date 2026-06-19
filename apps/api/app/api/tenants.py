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
    
    # Detect renamed locations to update sessions and events
    if "locations" in update_data and tenant.locations:
        old_locs = tenant.locations
        new_locs = update_data["locations"]
        for i, old_name in enumerate(old_locs):
            if i < len(new_locs):
                new_name = new_locs[i]
                if old_name != new_name and old_name.strip() and new_name.strip():
                    from app.models.models import Session, Event
                    from sqlalchemy import update
                    await db.execute(
                        update(Session)
                        .where(Session.tenant_id == tenant_id, Session.location == old_name)
                        .values(location=new_name)
                    )
                    await db.execute(
                        update(Event)
                        .where(Event.tenant_id == tenant_id, Event.location == old_name)
                        .values(location=new_name)
                    )

    # Detect renamed activity types to update sessions, offers and orders
    if "activity_types" in update_data and tenant.activity_types:
        old_acts = tenant.activity_types
        new_acts = update_data["activity_types"]
        for i, old_name in enumerate(old_acts):
            if i < len(new_acts):
                new_name = new_acts[i]
                if old_name != new_name and old_name.strip() and new_name.strip():
                    from app.models.models import Session, Offer, Order
                    from sqlalchemy import update
                    # 1. Update sessions
                    await db.execute(
                        update(Session)
                        .where(Session.tenant_id == tenant_id, Session.activity_type == old_name)
                        .values(activity_type=new_name)
                    )
                    # 2. Update offers
                    offers_res = await db.execute(
                        select(Offer).where(Offer.tenant_id == tenant_id)
                    )
                    for offer in offers_res.scalars().all():
                        if offer.allowed_activities and old_name in offer.allowed_activities:
                            offer.allowed_activities = [
                                new_name if x == old_name else x 
                                for x in offer.allowed_activities
                            ]
                            db.add(offer)
                    # 3. Update orders
                    orders_res = await db.execute(
                        select(Order).where(Order.tenant_id == tenant_id)
                    )
                    for order in orders_res.scalars().all():
                        if order.offer_snap_allowed_activities and old_name in order.offer_snap_allowed_activities:
                            order.offer_snap_allowed_activities = [
                                new_name if x == old_name else x 
                                for x in order.offer_snap_allowed_activities
                            ]
                            db.add(order)

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
