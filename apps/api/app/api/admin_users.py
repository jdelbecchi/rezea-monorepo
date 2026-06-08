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
    
    segments_map = await compute_users_segments(db, tenant_id)
    
    counts = {
        "prospect": 0,
        "decouverte_1": 0,
        "decouverte_2": 0,
        "post_essai": 0,
        "actif": 0,
        "occasionnel": 0,
        "distant": 0,
        "inactif": 0,
        "archive": 0,
    }
    for seg in segments_map.values():
        if seg in counts:
            counts[seg] += 1
            
    return counts


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


async def compute_users_segments(db: AsyncSession, tenant_id: UUID, user_ids: Optional[List[UUID]] = None) -> dict[UUID, str]:
    """
    Calcule dynamiquement le segment de chaque utilisateur selon l'arbre de décision comportemental.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import select, func, case
    from app.models.models import User, UserRole, Order, Offer, Booking, Session, CreditAccount, BookingStatus

    now = datetime.utcnow()
    days_180_ago = now - timedelta(days=180)
    days_300_ago = now - timedelta(days=300)

    # 1. Fetch Users
    users_stmt = select(User.id, User.role, User.created_at, User.is_archived, User.status_override)
    if user_ids is not None:
        if not user_ids:
            return {}
        users_stmt = users_stmt.where(User.id.in_(user_ids))
    else:
        users_stmt = users_stmt.where(User.tenant_id == tenant_id, User.role != UserRole.OWNER)

    users_res = await db.execute(users_stmt)
    users_list = users_res.all()
    if not users_list:
        return {}

    target_user_ids = [row.id for row in users_list]

    # 2. Fetch Credit Balance
    balance_stmt = select(CreditAccount.user_id, CreditAccount.balance).where(CreditAccount.user_id.in_(target_user_ids))
    balance_res = await db.execute(balance_stmt)
    balances_map = {row.user_id: row.balance for row in balance_res.all()}

    # 3. Fetch Order Aggregates
    orders_stmt = (
        select(
            Order.user_id,
            func.count(Order.id).label("total_orders"),
            func.sum(case((Order.status == "active", 1), else_=0)).label("active_orders"),
            func.max(Order.created_at).label("latest_order_date"),
            func.sum(case(((Order.status == "active") & (Offer.engagement_type == "regulier"), 1), else_=0)).label("active_regulier_orders"),
            func.sum(case(((Order.status == "active") & (Offer.engagement_type == "ponctuel"), 1), else_=0)).label("active_ponctuel_orders"),
            func.sum(case((Offer.engagement_type == "regulier", 1), else_=0)).label("total_regulier_orders")
        )
        .join(Offer, Order.offer_id == Offer.id)
        .where(Order.user_id.in_(target_user_ids))
        .group_by(Order.user_id)
    )
    orders_res = await db.execute(orders_stmt)
    orders_data = {row.user_id: row for row in orders_res.all()}

    # 4. Fetch Booking Aggregates
    bookings_stmt = (
        select(
            Booking.user_id,
            func.count(Booking.id).label("total_bookings"),
            func.sum(case((Session.start_time <= now, 1), else_=0)).label("past_bookings"),
            func.sum(case((Session.start_time > now, 1), else_=0)).label("future_bookings"),
            func.max(Session.start_time).label("latest_booking_date"),
            func.max(case((Session.start_time <= now, Session.start_time), else_=None)).label("latest_past_booking_date"),
            func.sum(case(((Session.start_time >= days_180_ago) & (Session.start_time <= now), 1), else_=0)).label("sessions_180"),
            func.sum(case(((Session.start_time >= days_300_ago) & (Session.start_time <= now), 1), else_=0)).label("sessions_300")
        )
        .join(Session, Booking.session_id == Session.id)
        .where(
            Booking.user_id.in_(target_user_ids),
            Booking.status.not_in([BookingStatus.CANCELLED, BookingStatus.SESSION_CANCELLED])
        )
        .group_by(Booking.user_id)
    )
    bookings_res = await db.execute(bookings_stmt)
    bookings_data = {row.user_id: row for row in bookings_res.all()}

    # 5. Compute Segments
    segments_map = {}
    for u in users_list:
        # Overrides & Admin roles
        if u.is_archived:
            segments_map[u.id] = "archive"
            continue
        if u.status_override is not None:
            segments_map[u.id] = u.status_override
            continue
        if u.role in (UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF):
            segments_map[u.id] = "actif"
            continue

        # Get metrics
        total_orders = 0
        active_orders = 0
        latest_order_date = None
        active_regulier_orders = 0
        active_ponctuel_orders = 0
        total_regulier_orders = 0
        if u.id in orders_data:
            o_row = orders_data[u.id]
            total_orders = o_row.total_orders or 0
            active_orders = o_row.active_orders or 0
            latest_order_date = o_row.latest_order_date
            active_regulier_orders = o_row.active_regulier_orders or 0
            active_ponctuel_orders = o_row.active_ponctuel_orders or 0
            total_regulier_orders = o_row.total_regulier_orders or 0

        total_bookings = 0
        past_bookings = 0
        future_bookings = 0
        latest_booking_date = None
        latest_past_booking_date = None
        sessions_180 = 0
        sessions_300 = 0
        if u.id in bookings_data:
            b_row = bookings_data[u.id]
            total_bookings = b_row.total_bookings or 0
            past_bookings = b_row.past_bookings or 0
            future_bookings = b_row.future_bookings or 0
            latest_booking_date = b_row.latest_booking_date
            latest_past_booking_date = b_row.latest_past_booking_date
            sessions_180 = b_row.sessions_180 or 0
            sessions_300 = b_row.sessions_300 or 0

        balance = balances_map.get(u.id, 0)
        days_since_created = (now - u.created_at).days
        days_since_latest_order = (now - latest_order_date).days if latest_order_date else None
        days_since_latest_booking = (now - latest_booking_date).days if latest_booking_date else None

        # Meets historical fidelity criteria
        meets_fidelity = False
        if days_since_created >= 180 and sessions_180 >= 18:
            meets_fidelity = True
        elif days_since_created >= 300 and sessions_300 >= 20:
            meets_fidelity = True

        no_active_offer = (active_orders == 0)

        # Archive rules
        is_archived_dynamically = False
        if total_orders == 0 and days_since_created > 90:
            is_archived_dynamically = True
        elif total_orders >= 1 and total_bookings == 0 and days_since_latest_order is not None and days_since_latest_order > 90:
            is_archived_dynamically = True
        elif total_bookings > 0 and past_bookings <= 3 and no_active_offer and days_since_latest_booking is not None and days_since_latest_booking > 90:
            is_archived_dynamically = True
        elif total_bookings > 3 and days_since_latest_booking is not None and days_since_latest_booking > 365 and (days_since_latest_order is None or days_since_latest_order > 365):
            is_archived_dynamically = True

        if is_archived_dynamically:
            segments_map[u.id] = "archive"
            continue

        # Prospect
        if total_orders == 0:
            segments_map[u.id] = "prospect"
            continue

        # Découverte 1
        if total_bookings == 0:
            segments_map[u.id] = "decouverte_1"
            continue

        # Découverte 2 / Post-Essai (past_bookings <= 3)
        if past_bookings <= 3:
            if balance == 0 and days_since_latest_booking is not None and days_since_latest_booking > 7:
                segments_map[u.id] = "post_essai"
            else:
                segments_map[u.id] = "decouverte_2"
            continue

        # Established (past_bookings > 3) - compute base segment
        segment = "inactif"
        if not no_active_offer:
            if active_regulier_orders > 0:
                segment = "actif"
            elif active_ponctuel_orders > 0:
                if meets_fidelity:
                    segment = "actif"
                else:
                    segment = "occasionnel"
            else:
                segment = "occasionnel"
        else:
            previously_actif = (total_regulier_orders > 0) or meets_fidelity
            if previously_actif:
                if days_since_latest_booking is not None and days_since_latest_booking < 60:
                    segment = "actif"
                else:
                    segment = "inactif"
            else:
                if days_since_latest_booking is not None and days_since_latest_booking < 180:
                    segment = "occasionnel"
                else:
                    segment = "inactif"

        # Distant check
        if segment in ("actif", "occasionnel") and not no_active_offer:
            has_recent_activity = False
            if future_bookings > 0:
                has_recent_activity = True
            elif days_since_latest_booking is not None and days_since_latest_booking <= 21:
                has_recent_activity = True

            if not has_recent_activity:
                segment = "distant"

        segments_map[u.id] = segment

    return segments_map


async def get_segment_user_ids(db: AsyncSession, tenant_id: UUID, segment: str) -> List[UUID]:
    """Calcule dynamiquement les IDs des utilisateurs appartenant à un segment donné"""
    segments_map = await compute_users_segments(db, tenant_id)
    return [uid for uid, seg in segments_map.items() if seg == segment]


async def attach_user_segments(db: AsyncSession, tenant_id: UUID, users: List[User]):
    """Calcule et attache le segment à chaque utilisateur dans la liste de manière optimisée"""
    if not users:
        return
    segments_map = await compute_users_segments(db, tenant_id, [u.id for u in users])
    for u in users:
        u.segment = segments_map.get(u.id)
