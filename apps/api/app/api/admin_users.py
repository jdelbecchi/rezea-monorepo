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
    segment: Optional[str] = Query(None, description="Filtrer par segment client"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Liste tous les utilisateurs du tenant (sauf owners)"""
    tenant_id = request.state.tenant_id

    from app.models.models import CreditAccount
    query = (
        select(User, CreditAccount.balance)
        .outerjoin(CreditAccount, User.id == CreditAccount.user_id)
        .where(
            User.tenant_id == tenant_id,
            User.role != UserRole.OWNER,
        )
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
        roles = []
        for r in role.split(","):
            r_clean = r.strip().lower()
            try:
                roles.append(UserRole(r_clean))
            except ValueError:
                pass
        if roles:
            query = query.where(User.role.in_(roles))

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    if segment:
        segments = [s.strip().lower() for s in segment.split(",") if s.strip()]
        segment_uids = set()
        for seg in segments:
            uids = await get_segment_user_ids(db, tenant_id, seg)
            segment_uids.update(uids)
        query = query.where(User.id.in_(list(segment_uids)))

    # Tri et pagination
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.all()
    users = []
    for user_obj, balance in rows:
        user_obj.balance = balance
        users.append(user_obj)

    # Logique pour calculer is_active et is_active_member dynamiquement de manière optimisée
    from app.models.models import Order
    user_ids = [u.id for u in users]
    active_orders_map = {}
    if user_ids:
        active_orders_query = (
            select(Order.user_id, func.count(Order.id))
            .where(Order.user_id.in_(user_ids), Order.status == "active")
            .group_by(Order.user_id)
        )
        active_orders_res = await db.execute(active_orders_query)
        active_orders_map = {row[0]: row[1] for row in active_orders_res.all()}

    for user in users:
        # 1. Manager/Staff -> Toujours Actif
        if user.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
            user.is_active = True
            user.is_active_member = False # Pas forcément un "membre" payant
        else:
            # 2. Vérifier si membre actif par commande
            has_active_order = active_orders_map.get(user.id, 0) > 0
            user.is_active_member = has_active_order
            
            # 3. Statut final : Override OU Commande Active
            user.is_active = user.is_active_override or has_active_order

    # 4. Attacher le segment marketing comportemental
    await attach_user_segments(db, tenant_id, users)

    return users


@router.get("/count")
async def count_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    segment: Optional[str] = Query(None),
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
        roles = []
        for r in role.split(","):
            r_clean = r.strip().lower()
            try:
                roles.append(UserRole(r_clean))
            except ValueError:
                pass
        if roles:
            query = query.where(User.role.in_(roles))

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    if segment:
        segments = [s.strip().lower() for s in segment.split(",") if s.strip()]
        segment_uids = set()
        for seg in segments:
            uids = await get_segment_user_ids(db, tenant_id, seg)
            segment_uids.update(uids)
        query = query.where(User.id.in_(list(segment_uids)))

    result = await db.execute(query)
    count = result.scalar()

    return {"count": count}


@router.get("/segments/stats")
async def get_segments_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Renvoie le nombre d'utilisateurs dans chaque segment pour le tableau de bord"""
    tenant_id = request.state.tenant_id
    
    explorateurs = await get_segment_user_ids(db, tenant_id, "explorateur")
    decouvertes = await get_segment_user_ids(db, tenant_id, "decouverte")
    reguliers = await get_segment_user_ids(db, tenant_id, "regulier")
    endormis = await get_segment_user_ids(db, tenant_id, "endormi")
    flexibles = await get_segment_user_ids(db, tenant_id, "flexible")
    anciens = await get_segment_user_ids(db, tenant_id, "ancien")
    
    return {
        "explorateur": len(explorateurs),
        "decouverte": len(decouvertes),
        "regulier": len(reguliers),
        "endormi": len(endormis),
        "flexible": len(flexibles),
        "ancien": len(anciens),
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Récupère les détails d'un utilisateur"""
    tenant_id = request.state.tenant_id

    from app.models.models import CreditAccount
    result = await db.execute(
        select(User, CreditAccount.balance)
        .outerjoin(CreditAccount, User.id == CreditAccount.user_id)
        .where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.role != UserRole.OWNER,
        )
    )
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    user, balance = row
    user.balance = balance

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

    # Attacher le segment marketing comportemental
    await attach_user_segments(db, tenant_id, [user])

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

    # Attacher le segment marketing comportemental
    await attach_user_segments(db, tenant_id, [user])

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


async def get_segment_user_ids(db: AsyncSession, tenant_id: UUID, segment: str) -> List[UUID]:
    """Calcule dynamiquement les IDs des utilisateurs appartenant à un segment donné"""
    from app.models.models import Order, Booking, Session, User
    from datetime import datetime, timedelta
    from sqlalchemy import exists
    
    now = datetime.utcnow()
    fourteen_days_ago = now - timedelta(days=14)
    twenty_one_days_ago = now - timedelta(days=21)
    sixty_days_ago = now - timedelta(days=60)
    
    # 1. Explorateurs : Membres inscrits sans aucune commande
    if segment == "explorateur":
        stmt = (
            select(User.id)
            .where(
                User.tenant_id == tenant_id,
                User.role == UserRole.USER,
                ~exists().where(Order.user_id == User.id)
            )
        )
        res = await db.execute(stmt)
        return [row[0] for row in res.all()]
        
    # 2. Découvertes : Membres ayant exactement 1 commande au total, et pas de réservation future
    elif segment == "decouverte":
        # Utilisateurs avec exactement 1 commande
        users_with_one_order_stmt = (
            select(Order.user_id)
            .join(User, Order.user_id == User.id)
            .where(User.tenant_id == tenant_id, User.role == UserRole.USER)
            .group_by(Order.user_id)
            .having(func.count(Order.id) == 1)
        )
        res = await db.execute(users_with_one_order_stmt)
        one_order_user_ids = [row[0] for row in res.all()]
        
        if not one_order_user_ids:
            return []
            
        # Filtrer ceux qui n'ont aucune réservation future
        future_bookings_stmt = (
            select(Booking.user_id)
            .join(Session, Booking.session_id == Session.id)
            .where(
                Booking.user_id.in_(one_order_user_ids),
                Session.start_time >= now
            )
        )
        res_future = await db.execute(future_bookings_stmt)
        users_with_future_bookings = set([row[0] for row in res_future.all()])
        
        return [uid for uid in one_order_user_ids if uid not in users_with_future_bookings]
        
    # 3. Réguliers : Membres ayant une commande active ET au moins 1 réservation confirmée les 14 derniers jours
    elif segment == "regulier":
        # Commande active
        active_stmt = (
            select(Order.user_id)
            .join(User, Order.user_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                User.role == UserRole.USER,
                Order.status == "active"
            )
        )
        res_active = await db.execute(active_stmt)
        active_uids = set([row[0] for row in res_active.all()])
        
        if not active_uids:
            reg_uids = set()
        else:
            # Réservation récente dans les 14 jours
            recent_stmt = (
                select(Booking.user_id)
                .join(Session, Booking.session_id == Session.id)
                .where(
                    Booking.user_id.in_(list(active_uids)),
                    Session.start_time >= fourteen_days_ago
                )
            )
            res_recent = await db.execute(recent_stmt)
            recent_uids = set([row[0] for row in res_recent.all()])
            reg_uids = active_uids.intersection(recent_uids)
            
        # Ajouter TOUS les managers, staff et owners (car ils sont systématiquement considérés comme Actifs)
        admin_stmt = select(User.id).where(
            User.tenant_id == tenant_id,
            User.role.in_([UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF])
        )
        res_admin = await db.execute(admin_stmt)
        admin_uids = set([row[0] for row in res_admin.all()])
        
        return list(reg_uids.union(admin_uids))
        
    # 4. Endormis : Membres ayant une commande active ET aucune réservation dans les 21 derniers jours
    elif segment == "endormi":
        # Commande active
        active_stmt = (
            select(Order.user_id)
            .join(User, Order.user_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                User.role == UserRole.USER,
                Order.status == "active"
            )
        )
        res_active = await db.execute(active_stmt)
        active_uids = set([row[0] for row in res_active.all()])
        
        if not active_uids:
            return []
            
        # Réservation récente dans les 21 jours
        recent_21_stmt = (
            select(Booking.user_id)
            .join(Session, Booking.session_id == Session.id)
            .where(
                Booking.user_id.in_(list(active_uids)),
                Session.start_time >= twenty_one_days_ago
            )
        )
        res_recent = await db.execute(recent_21_stmt)
        recent_21_uids = set([row[0] for row in res_recent.all()])
        
        return list(active_uids.difference(recent_21_uids))
        
    # 5. Flexibles : Membres sans commande active, mais ayant au moins 1 commande au total, et au moins 1 réservation les 60 derniers jours
    elif segment == "flexible":
        # Toutes les commandes actives uids
        active_stmt = select(Order.user_id).where(Order.status == "active")
        res_active = await db.execute(active_stmt)
        active_uids = set([row[0] for row in res_active.all()])
        
        # Utilisateurs ayant commandé au moins une fois
        ordered_stmt = (
            select(Order.user_id)
            .join(User, Order.user_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                User.role == UserRole.USER
            )
            .group_by(Order.user_id)
        )
        res_ordered = await db.execute(ordered_stmt)
        ordered_uids = set([row[0] for row in res_ordered.all()])
        
        uids_no_active = ordered_uids.difference(active_uids)
        
        if not uids_no_active:
            return []
            
        # Ayant au moins une réservation les 60 derniers jours
        recent_60_stmt = (
            select(Booking.user_id)
            .join(Session, Booking.session_id == Session.id)
            .where(
                Booking.user_id.in_(list(uids_no_active)),
                Session.start_time >= sixty_days_ago
            )
        )
        res_recent = await db.execute(recent_60_stmt)
        recent_60_uids = set([row[0] for row in res_recent.all()])
        
        return list(recent_60_uids)
        
    # 6. Anciens : Membres ayant au moins 1 commande dans l'historique, aucune commande active, et aucune réservation dans les 60 derniers jours
    elif segment == "ancien":
        # Toutes les commandes actives uids
        active_stmt = select(Order.user_id).where(Order.status == "active")
        res_active = await db.execute(active_stmt)
        active_uids = set([row[0] for row in res_active.all()])
        
        # Utilisateurs ayant commandé au moins une fois
        ordered_stmt = (
            select(Order.user_id)
            .join(User, Order.user_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                User.role == UserRole.USER
            )
            .group_by(Order.user_id)
        )
        res_ordered = await db.execute(ordered_stmt)
        ordered_uids = set([row[0] for row in res_ordered.all()])
        
        uids_no_active = ordered_uids.difference(active_uids)
        
        if not uids_no_active:
            return []
            
        # Ayant au moins une réservation les 60 derniers jours
        recent_60_stmt = (
            select(Booking.user_id)
            .join(Session, Booking.session_id == Session.id)
            .where(
                Booking.user_id.in_(list(uids_no_active)),
                Session.start_time >= sixty_days_ago
            )
        )
        res_recent = await db.execute(recent_60_stmt)
        recent_60_uids = set([row[0] for row in res_recent.all()])
        
        return list(uids_no_active.difference(recent_60_uids))
        
    return []


async def attach_user_segments(db: AsyncSession, tenant_id: UUID, users: List[User]):
    """Calcule et attache le segment à chaque utilisateur dans la liste de manière optimisée"""
    if not users:
        return

    from app.models.models import Order, Booking, Session, UserRole
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    fourteen_days_ago = now - timedelta(days=14)
    twenty_one_days_ago = now - timedelta(days=21)
    sixty_days_ago = now - timedelta(days=60)
    
    user_ids = [u.id for u in users]
    
    # 1. Nombre total de commandes par utilisateur
    total_orders_query = (
        select(Order.user_id, func.count(Order.id))
        .where(Order.user_id.in_(user_ids))
        .group_by(Order.user_id)
    )
    total_orders_res = await db.execute(total_orders_query)
    total_orders_map = {row[0]: row[1] for row in total_orders_res.all()}
    
    # 2. Nombre de commandes actives par utilisateur
    active_orders_query = (
        select(Order.user_id, func.count(Order.id))
        .where(Order.user_id.in_(user_ids), Order.status == "active")
        .group_by(Order.user_id)
    )
    active_orders_res = await db.execute(active_orders_query)
    active_orders_map = {row[0]: row[1] for row in active_orders_res.all()}
    
    # 3. Réservations futures (pour le segment découverte)
    future_bookings_query = (
        select(Booking.user_id)
        .join(Session, Booking.session_id == Session.id)
        .where(Booking.user_id.in_(user_ids), Session.start_time >= now)
    )
    future_bookings_res = await db.execute(future_bookings_query)
    future_bookings_set = set(row[0] for row in future_bookings_res.all())
    
    # 4. Date de la dernière réservation pour chaque utilisateur
    latest_booking_query = (
        select(Booking.user_id, func.max(Session.start_time))
        .join(Session, Booking.session_id == Session.id)
        .where(Booking.user_id.in_(user_ids))
        .group_by(Booking.user_id)
    )
    latest_booking_res = await db.execute(latest_booking_query)
    latest_booking_map = {row[0]: row[1] for row in latest_booking_res.all()}
    
    for u in users:
        if u.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
            u.segment = "regulier"
            continue
            
        total_orders = total_orders_map.get(u.id, 0)
        active_orders = active_orders_map.get(u.id, 0)
        has_future_bookings = u.id in future_bookings_set
        latest_booking = latest_booking_map.get(u.id)
        
        # 1. Explorateurs : Membres inscrits sans aucune commande
        if total_orders == 0:
            u.segment = "explorateur"
            
        # 2. Découvertes : Membres ayant exactement 1 commande au total, et pas de réservation future
        elif total_orders == 1 and not has_future_bookings:
            u.segment = "decouverte"
            
        # 3. Réguliers : Membres ayant une commande active ET au moins 1 réservation confirmée les 14 derniers jours
        elif active_orders > 0 and latest_booking and latest_booking >= fourteen_days_ago:
            u.segment = "regulier"
            
        # 4. Endormis : Membres ayant une commande active ET aucune réservation dans les 21 derniers jours
        elif active_orders > 0 and (not latest_booking or latest_booking < twenty_one_days_ago):
            u.segment = "endormi"
            
        # 5. Flexibles : Membres sans commande active, mais ayant au moins 1 commande au total, et au moins 1 réservation les 60 derniers jours
        elif active_orders == 0 and total_orders > 0 and latest_booking and latest_booking >= sixty_days_ago:
            u.segment = "flexible"
            
        # 6. Anciens : Membres ayant au moins 1 commande dans l'historique, aucune commande active, et aucune réservation dans les 60 derniers jours
        elif active_orders == 0 and total_orders > 0 and (not latest_booking or latest_booking < sixty_days_ago):
            u.segment = "ancien"
            
        else:
            u.segment = None
