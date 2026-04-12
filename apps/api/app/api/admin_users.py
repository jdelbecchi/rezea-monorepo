"""
Routes d'administration des utilisateurs
Accessible uniquement aux rôles owner et manager
"""
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field
from datetime import date

from app.db.session import get_db
from app.models.models import User, UserRole
from app.schemas.schemas import UserResponse, UserUpdate
from app.core.security import get_password_hash

router = APIRouter()


class AdminUserCreate(BaseModel):
    """Création d'utilisateur par un admin"""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: str = "user"
    phone: Optional[str] = None
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    birth_date: Optional[date] = None
    instagram_handle: Optional[str] = None
    facebook_handle: Optional[str] = None
    is_active_override: bool = False


async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id

    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()

    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux managers"
        )
    return user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Crée un nouvel utilisateur dans le tenant"""
    tenant_id = request.state.tenant_id

    # Empêcher de créer un owner
    if user_data.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de créer un utilisateur avec le rôle owner"
        )

    # Vérifier que l'email n'existe pas déjà dans le tenant
    result = await db.execute(
        select(User).where(User.email == user_data.email, User.tenant_id == tenant_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un utilisateur avec cet email existe déjà"
        )

    new_user = User(
        tenant_id=tenant_id,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        phone=user_data.phone,
        street=user_data.street,
        zip_code=user_data.zip_code,
        city=user_data.city,
        birth_date=user_data.birth_date,
        instagram_handle=user_data.instagram_handle,
        facebook_handle=user_data.facebook_handle,
        is_active_override=user_data.is_active_override,
        created_by_admin=True,
        is_active=True, 
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Calculer le statut initial pour la réponse
    from app.models.models import Order
    order_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == new_user.id, Order.status == "active")
    )
    has_active_order = order_result.scalar() > 0
    new_user.is_active_member = has_active_order
    
    # Manager/Staff -> Actif
    if new_user.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
        new_user.is_active = True
    else:
        new_user.is_active = new_user.is_active_override or has_active_order

    return new_user


@router.get("", response_model=List[UserResponse])
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    search: Optional[str] = Query(None, description="Recherche par nom, prénom ou email"),
    role: Optional[str] = Query(None, description="Filtrer par rôle"),
    is_active: Optional[bool] = Query(None, description="Filtrer par statut actif/inactif"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Liste tous les utilisateurs du tenant (sauf owners)"""
    tenant_id = request.state.tenant_id

    query = select(User).where(
        User.tenant_id == tenant_id,
        User.role != UserRole.OWNER,
    )

    # Filtres
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                User.first_name.ilike(search_term),
                User.last_name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    if role:
        query = query.where(User.role == role)

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Tri et pagination
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    # Logique pour calculer is_active et is_active_member dynamiquement
    from app.models.models import Order
    for user in users:
        # 1. Manager/Staff -> Toujours Actif
        if user.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
            user.is_active = True
            user.is_active_member = False # Pas forcément un "membre" payant
        else:
            # 2. Vérifier si membre actif par commande
            order_result = await db.execute(
                select(func.count(Order.id)).where(
                    Order.user_id == user.id,
                    Order.status == "active"
                )
            )
            has_active_order = order_result.scalar() > 0
            user.is_active_member = has_active_order
            
            # 3. Statut final : Override OU Commande Active
            user.is_active = user.is_active_override or has_active_order

    return users


@router.get("/count")
async def count_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
):
    """Compte le nombre total d'utilisateurs (pour pagination)"""
    tenant_id = request.state.tenant_id

    query = select(func.count(User.id)).where(
        User.tenant_id == tenant_id,
        User.role != UserRole.OWNER,
    )

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                User.first_name.ilike(search_term),
                User.last_name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    if role:
        query = query.where(User.role == role)

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    result = await db.execute(query)
    count = result.scalar()

    return {"count": count}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Récupère les détails d'un utilisateur"""
    tenant_id = request.state.tenant_id

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role != UserRole.OWNER,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )

    # Calcul dynamique du statut
    from app.models.models import Order
    order_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == user.id, Order.status == "active")
    )
    has_active_order = order_result.scalar() > 0
    user.is_active_member = has_active_order
    
    if user.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
        user.is_active = True
    else:
        user.is_active = user.is_active_override or has_active_order

    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    update_data: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Met à jour un utilisateur"""
    tenant_id = request.state.tenant_id

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role != UserRole.OWNER,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )

    # Empêcher de promouvoir en owner
    update_dict = update_data.model_dump(exclude_unset=True)
    if "role" in update_dict and update_dict["role"] == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'attribuer le rôle owner"
        )

    # Handle password change
    if "password" in update_dict:
        raw_password = update_dict.pop("password")
        if raw_password and len(raw_password) >= 8:
            user.hashed_password = get_password_hash(raw_password)
        elif raw_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le mot de passe doit contenir au moins 8 caractères"
            )

    for field, value in update_dict.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    # Calcul dynamique du statut après mise à jour
    from app.models.models import Order
    order_result = await db.execute(
        select(func.count(Order.id)).where(Order.user_id == user.id, Order.status == "active")
    )
    has_active_order = order_result.scalar() > 0
    user.is_active_member = has_active_order
    
    if user.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
        user.is_active = True
    else:
        user.is_active = user.is_active_override or has_active_order

    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Supprime un utilisateur"""
    tenant_id = request.state.tenant_id

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role != UserRole.OWNER,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )

    # Empêcher un manager de se supprimer lui-même
    if str(user.id) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de supprimer votre propre compte"
        )

    await db.delete(user)
    await db.commit()

    return {"detail": "Utilisateur supprimé"}
