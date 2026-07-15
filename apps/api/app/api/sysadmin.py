"""Routes sysadmin — gestion globale des tenants (hors-tenant)"""
from datetime import timedelta, datetime
import secrets
import io
import uuid
import openpyxl
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.db.session import get_db
from app.models.models import (
    SysAdmin, Tenant, User, Offer, Order, OrderPaymentStatus, FinancePaymentMethod, UserRole
)
from app.schemas.schemas import (
    SysAdminLogin, SysAdminTokenResponse, SysAdminResponse,
    TenantCreate, TenantResponse
)
from app.core.security import (
    verify_password, create_sysadmin_token, verify_sysadmin_token, get_password_hash
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
    """Liste tous les tenants avec les comptes d'utilisateurs actifs et totaux"""
    cutoff_login = datetime.utcnow() - timedelta(days=90)
    cutoff_created = datetime.utcnow() - timedelta(days=30)

    # Sous-requête pour le nombre total d'utilisateurs par tenant
    total_sub = (
        select(User.tenant_id, func.count(User.id).label("total"))
        .group_by(User.tenant_id)
        .subquery()
    )

    # Sous-requête pour le nombre d'utilisateurs actifs par tenant
    active_cond = and_(
        User.is_active == True,
        User.is_archived == False,
        or_(
            User.last_login >= cutoff_login,
            User.created_at >= cutoff_created
        )
    )
    active_sub = (
        select(User.tenant_id, func.count(User.id).label("active"))
        .where(active_cond)
        .group_by(User.tenant_id)
        .subquery()
    )

    # Jointure avec Tenant
    query = (
        select(
            Tenant,
            func.coalesce(total_sub.c.total, 0).label("total_count"),
            func.coalesce(active_sub.c.active, 0).label("active_count")
        )
        .outerjoin(total_sub, Tenant.id == total_sub.c.tenant_id)
        .outerjoin(active_sub, Tenant.id == active_sub.c.tenant_id)
        .order_by(Tenant.created_at.desc())
    )

    result = await db.execute(query)
    tenants_list = []
    for row in result.all():
        t = row[0]
        t.total_users_count = row[1]
        t.active_users_count = row[2]
        tenants_list.append(t)

    return tenants_list


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

    # Préparer le nouveau tenant
    tenant_dict = tenant_in.model_dump()
    
    # Générer le token d'invitation (valable 7 jours par défaut)
    tenant_dict["invitation_token"] = secrets.token_urlsafe(32)
    tenant_dict["invitation_expires_at"] = datetime.utcnow() + timedelta(days=7)

    tenant = Tenant(**tenant_dict)
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

    allowed_fields = {
        "name", "description", "is_active", "max_users", "max_sessions_per_day",
        "client_first_name", "client_last_name", "client_email", "client_phone",
        "client_address", "sysadmin_notes"
    }
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


@router.post("/tenants/{tenant_id}/generate-token", response_model=TenantResponse)
async def generate_invitation_token(
    tenant_id: str,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Génère ou régénère un token d'invitation pour le tenant"""
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    tenant.invitation_token = secrets.token_urlsafe(32)
    tenant.invitation_expires_at = datetime.utcnow() + timedelta(days=7)
    
    await db.commit()
    await db.refresh(tenant)
    
    logger.info("Token d'invitation régénéré par sysadmin", tenant_id=str(tenant.id))
    return tenant


@router.post("/tenants/{tenant_id}/import")
async def import_tenant_data(
    tenant_id: str,
    file: UploadFile = File(...),
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Importation Excel des utilisateurs et commandes associées pour un tenant"""
    # 1. Vérifier si le tenant existe
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    # 2. Lire le fichier (Excel ou CSV)
    rows = []
    try:
        contents = await file.read()
        filename_lower = file.filename.lower() if file.filename else ""
        if filename_lower.endswith(".csv"):
            import csv
            # Décoder le contenu (gestion UTF-8 avec/sans BOM et Latin-1)
            try:
                decoded = contents.decode("utf-8-sig")
            except UnicodeDecodeError:
                decoded = contents.decode("latin-1")
            
            # Détection automatique du séparateur (virgule ou point-virgule)
            first_line = decoded.split("\n")[0] if decoded else ""
            delimiter = ";" if ";" in first_line else ","
            
            reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
            rows = list(reader)
        else:
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            sheet = wb.active
            rows = list(sheet.iter_rows(values_only=True))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Format de fichier invalide (Excel ou CSV attendu) : {str(e)}")

    if not rows:
        raise HTTPException(status_code=400, detail="Fichier vide")
    
    headers = [str(h).strip().lower() for h in rows[0] if h is not None]
    
    # Mapper les headers aux index
    def find_index(names):
        for name in names:
            for idx, h in enumerate(headers):
                if name.lower() in h:
                    return idx
        return -1

    email_idx = find_index(["email", "e-mail"])
    first_name_idx = find_index(["prénom", "prenom", "first name", "first_name"])
    last_name_idx = find_index(["nom", "last name", "last_name"])
    phone_idx = find_index(["téléphone", "telephone", "phone", "tel"])
    offer_idx = find_index(["offre", "formula", "formule", "offer"])
    price_idx = find_index(["prix", "price", "montant"])
    payment_status_idx = find_index(["statut", "status", "paiement"])

    if email_idx == -1 or first_name_idx == -1 or last_name_idx == -1:
        raise HTTPException(
            status_code=400,
            detail="Le fichier Excel doit contenir au moins les colonnes 'Email', 'Prénom' et 'Nom'"
        )

    imported_users = 0
    imported_orders = 0
    errors = []

    for row_num, row in enumerate(rows[1:], start=2):
        if not row or all(v is None for v in row):
            continue

        email = row[email_idx]
        first_name = row[first_name_idx]
        last_name = row[last_name_idx]

        if not email or not first_name or not last_name:
            errors.append(f"Ligne {row_num}: Email, Prénom et Nom requis")
            continue

        email = str(email).strip().lower()
        first_name = str(first_name).strip()
        last_name = str(last_name).strip()
        phone = str(row[phone_idx]).strip() if phone_idx != -1 and row[phone_idx] is not None else None

        # Check if user already exists in this tenant
        user_check = await db.execute(
            select(User).where(User.email == email, User.tenant_id == tenant.id)
        )
        user = user_check.scalar_one_or_none()
        
        if not user:
            # Create user
            temp_pass = secrets.token_hex(8)
            user = User(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                email=email,
                hashed_password=get_password_hash(temp_pass),
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                is_active=True,
                is_archived=False,
                email_verified=True,
                created_by_admin=True
            )
            db.add(user)
            imported_users += 1
        else:
            if not user.phone and phone:
                user.phone = phone

        # Handle associated order if offer name is provided
        offer_name = row[offer_idx] if offer_idx != -1 and row[offer_idx] is not None else None
        if offer_name:
            offer_name = str(offer_name).strip()
            
            # Find the offer in the database
            offer_check = await db.execute(
                select(Offer).where(Offer.name == offer_name, Offer.tenant_id == tenant.id)
            )
            offer = offer_check.scalar_one_or_none()
            
            if not offer:
                # Créer l'offre à la volée
                offer = Offer(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    offer_code=offer_name.lower().replace(" ", "-")[:50],
                    name=offer_name,
                    price_lump_sum_cents=0,
                    is_active=True,
                    validity_days=365,
                    is_unlimited=True
                )
                db.add(offer)
                await db.flush()

            # Price
            try:
                price_val = Decimal(str(row[price_idx])) if price_idx != -1 and row[price_idx] is not None else Decimal("0")
            except Exception:
                price_val = Decimal("0")

            price_cents = int(price_val * 100)
            if price_cents == 0 and offer.price_lump_sum_cents:
                price_cents = offer.price_lump_sum_cents

            # Payment status
            pay_status = OrderPaymentStatus.PAID
            if payment_status_idx != -1 and row[payment_status_idx] is not None:
                status_str = str(row[payment_status_idx]).strip().lower()
                if "attente" in status_str or "pending" in status_str or "non" in status_str:
                    pay_status = OrderPaymentStatus.PENDING
                elif "echoue" in status_str or "failed" in status_str:
                    pay_status = OrderPaymentStatus.FAILED

            # Create Order
            order = Order(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                user_id=user.id,
                offer_id=offer.id,
                start_date=datetime.utcnow().date(),
                price_cents=price_cents,
                credits_total=offer.classes_included,
                is_unlimited=offer.is_unlimited,
                activity_credits=offer.activity_credits,
                payment_status=pay_status,
                offer_snap_name=offer.name,
                offer_snap_code=offer.offer_code,
                offer_snap_description=offer.description,
                offer_snap_validity_days=offer.validity_days,
                offer_snap_validity_unit=offer.validity_unit,
                offer_snap_is_validity_unlimited=offer.is_validity_unlimited,
                offer_snap_allowed_activities=offer.allowed_activities,
                offer_snap_activity_credits=offer.activity_credits,
                created_by_admin=True,
                created_at=datetime.utcnow()
            )
            db.add(order)
            imported_orders += 1

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur d'écriture en base : {str(e)}")

    logger.info("Importation Excel terminée par sysadmin", tenant_id=tenant_id, users_count=imported_users, orders_count=imported_orders)
    return {
        "success": True,
        "imported_users": imported_users,
        "imported_orders": imported_orders,
        "errors": errors
    }


@router.post("/tenants/{tenant_id}/reset-owner", response_model=TenantResponse)
async def reset_tenant_owner(
    tenant_id: str,
    _=Depends(get_current_sysadmin),
    db: AsyncSession = Depends(get_db)
):
    """Réinitialise le propriétaire d'un tenant pour permettre une nouvelle inscription (Initialisation)"""
    # 1. Trouver le tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    # 2. Trouver l'ancien propriétaire (Owner) et changer son rôle en manager
    owner_result = await db.execute(
        select(User).where(User.tenant_id == tenant.id, User.role == UserRole.OWNER)
    )
    owners = owner_result.scalars().all()
    for owner in owners:
        owner.role = UserRole.MANAGER

    # 3. Réinitialiser le statut de revendication et générer un nouveau token
    tenant.claimed_at = None
    tenant.invitation_token = secrets.token_urlsafe(32)
    tenant.invitation_expires_at = datetime.utcnow() + timedelta(days=7)

    await db.commit()
    await db.refresh(tenant)

    logger.info("Propriétaire réinitialisé pour le tenant", tenant_id=str(tenant.id))
    return tenant
