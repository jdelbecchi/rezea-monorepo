"""Routes tenants"""
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.session import get_db
from app.models.models import Tenant, User, UserRole, CreditAccount
from app.schemas.schemas import TenantResponse, TenantCreate, TenantSettingsUpdate, TenantClaim, TokenResponse, PaymentVerifyRequest
from app.core.security import get_password_hash, create_access_token
from app.core.config import settings

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
    
    # Éviter d'écraser les secrets s'ils sont renvoyés masqués par le frontend
    if "stripe_secret_key" in update_data and update_data["stripe_secret_key"] == "••••••••••••":
        update_data.pop("stripe_secret_key")
    if "helloasso_client_secret" in update_data and update_data["helloasso_client_secret"] == "••••••••••••":
        update_data.pop("helloasso_client_secret")
    if "helloasso_webhook_secret" in update_data and update_data["helloasso_webhook_secret"] == "••••••••••••":
        update_data.pop("helloasso_webhook_secret")
        
    # Chiffrer les secrets avant l'enregistrement en base
    from app.core.security import encrypt_value
    for secret_field in ["stripe_secret_key", "helloasso_client_secret", "helloasso_webhook_secret"]:
        if secret_field in update_data and update_data[secret_field]:
            update_data[secret_field] = encrypt_value(update_data[secret_field])
    
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


@router.post("/current/settings/payment/verify")
async def verify_payment_settings(
    verify_in: PaymentVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Teste si les identifiants Stripe ou HelloAsso fournis sont valides (Ping initial).
    """
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    
    # Vérifier l'autorisation (admin requis)
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs du club"
        )

    if verify_in.provider == "helloasso":
        client_id = verify_in.helloasso_client_id
        client_secret = verify_in.helloasso_client_secret
        
        # Si le secret n'est pas fourni mais était déjà configuré, charger le secret existant
        if client_secret == "••••••••••••":
            tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
            tenant = tenant_res.scalar_one_or_none()
            if tenant and tenant.helloasso_client_secret:
                from app.core.security import decrypt_value
                client_secret = decrypt_value(tenant.helloasso_client_secret)
        
        if not client_id or not client_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ID Client et Clé secrète requis pour HelloAsso."
            )
            
        from app.services.helloasso import helloasso_service
        try:
            # Effectuer un ping (demande de token d'accès)
            await helloasso_service.get_access_token(client_id, client_secret)
            return {"status": "success", "message": "Connexion à HelloAsso établie avec succès !"}
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Erreur d'authentification HelloAsso : {str(e)}"
            )
            
    elif verify_in.provider == "stripe":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mode automatisé Stripe n'est pas disponible pour le moment."
        )




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


@router.get("/claim/verify", response_model=TenantResponse)
async def verify_claim_token(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Vérifie si un token d'invitation est valide et retourne le tenant associé (Public)"""
    result = await db.execute(
        select(Tenant).where(Tenant.invitation_token == token)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jeton d'invitation invalide"
        )
    
    if tenant.invitation_expires_at and tenant.invitation_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jeton d'invitation expiré"
        )
    
    return tenant


@router.post("/claim", response_model=TokenResponse)
async def claim_tenant(
    claim_in: TenantClaim,
    db: AsyncSession = Depends(get_db)
):
    """Initialise le premier administrateur du tenant et consomme le jeton (Public)"""
    # 1. Vérifier le token
    result = await db.execute(
        select(Tenant).where(Tenant.invitation_token == claim_in.token)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jeton d'invitation invalide"
        )
    
    if tenant.invitation_expires_at and tenant.invitation_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jeton d'invitation expiré"
        )
        
    # 2. Vérifier que l'email n'est pas déjà utilisé au sein de ce tenant
    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            User.email == claim_in.email
        )
    )
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet email est déjà utilisé pour cet établissement"
        )
        
    # 3. Créer l'utilisateur Administrateur (Role owner)
    new_user = User(
        tenant_id=tenant.id,
        email=claim_in.email,
        hashed_password=get_password_hash(claim_in.password),
        first_name=claim_in.first_name,
        last_name=claim_in.last_name,
        role=UserRole.OWNER,
        is_active=True,
        is_active_override=True,
        email_verified=True,
        created_by_admin=False
    )
    db.add(new_user)
    await db.flush()  # Obtenir l'ID
    
    # 4. Créer le compte de crédits associé
    credit_account = CreditAccount(
        tenant_id=tenant.id,
        user_id=new_user.id,
        balance=0
    )
    db.add(credit_account)
    
    # 5. Consommer le token
    tenant.invitation_token = None
    tenant.invitation_expires_at = None
    tenant.claimed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(new_user)
    
    # 6. Générer le JWT token de connexion immédiate
    access_token = create_access_token(
        data={
            "sub": str(new_user.id),
            "tenant_id": str(tenant.id),
            "role": new_user.role.value
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    # Mettre à jour last_login
    new_user.last_login = datetime.utcnow()
    await db.commit()
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=new_user.id,
        tenant_id=tenant.id,
        role=new_user.role
    )
