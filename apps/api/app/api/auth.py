"""
Routes d'authentification
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    validate_password_strength,
    create_reset_token,
    verify_reset_token,
)
from app.core.config import settings
from app.models.models import User, Tenant, CreditAccount
from app.schemas.schemas import (
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
import structlog

logger = structlog.get_logger()
router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Inscription d'un nouvel utilisateur
    
    1. Vérifie que le tenant existe
    2. Vérifie que l'email n'est pas déjà utilisé
    3. Valide la force du mot de passe
    4. Crée l'utilisateur et son compte de crédits
    """
    # Vérifier le tenant
    result = await db.execute(
        select(Tenant).where(
            Tenant.slug == user_data.tenant_slug,
            Tenant.is_active == True
        )
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Établissement '{user_data.tenant_slug}' non trouvé"
        )
    
    # Vérifier que l'email n'existe pas
    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            User.email == user_data.email
        )
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet email est déjà utilisé"
        )
    
    # Valider le mot de passe
    if not validate_password_strength(user_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre"
        )
    
    from datetime import datetime
    
    # Créer l'utilisateur
    new_user = User(
        tenant_id=tenant.id,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone=user_data.phone,
        docs_accepted_at=datetime.utcnow() if user_data.docs_accepted else None
    )
    
    db.add(new_user)
    await db.flush()  # Pour obtenir l'ID
    
    # Créer le compte de crédits
    credit_account = CreditAccount(
        tenant_id=tenant.id,
        user_id=new_user.id,
        balance=0
    )
    db.add(credit_account)
    
    await db.commit()
    await db.refresh(new_user)
    
    logger.info(
        "Utilisateur créé",
        user_id=str(new_user.id),
        tenant_id=str(tenant.id),
        email=user_data.email
    )
    
    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Connexion utilisateur
    
    1. Vérifie le tenant
    2. Trouve l'utilisateur par email
    3. Vérifie le mot de passe
    4. Génère un JWT token
    """
    # Vérifier le tenant
    result = await db.execute(
        select(Tenant).where(
            Tenant.slug == credentials.tenant_slug,
            Tenant.is_active == True
        )
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        logger.warning(
            "Échec connexion: Tenant non trouvé ou inactif",
            tenant_slug=credentials.tenant_slug
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects"
        )
    
    # Trouver l'utilisateur
    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            User.email == credentials.email
        )
    )
    user = result.scalar_one_or_none()
    
    if not user:
        logger.warning(
            "Échec connexion: Utilisateur non trouvé",
            email=credentials.email,
            tenant_slug=credentials.tenant_slug
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects"
        )
    
    if not verify_password(credentials.password, user.hashed_password):
        logger.warning(
            "Échec connexion: Mot de passe incorrect",
            email=credentials.email,
            tenant_slug=credentials.tenant_slug
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects"
        )
    
    # 1. Manager/Staff sont toujours actifs
    is_effectively_active = False
    if user.role in ("owner", "manager", "staff"):
        is_effectively_active = True
    elif user.is_active_override:
        is_effectively_active = True
    else:
        # 2. Vérifier si membre actif par commande
        from app.models.models import Order
        order_result = await db.execute(
            select(func.count(Order.id)).where(
                Order.user_id == user.id,
                Order.status == "active"
            )
        )
        if order_result.scalar() > 0:
            is_effectively_active = True

    if not is_effectively_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé ou inactif"
        )
    
    # Créer le token
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "tenant_id": str(tenant.id),
            "role": user.role.value
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    # Mettre à jour last_login
    from datetime import datetime
    user.last_login = datetime.utcnow()
    await db.commit()
    
    logger.info(
        "Connexion réussie",
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        email=user.email
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        tenant_id=tenant.id,
        role=user.role
    )


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Demande de réinitialisation de mot de passe.

    Génère un token de réinitialisation et l'affiche dans les logs (dev).
    Retourne toujours 200 pour ne pas révéler si l'email existe.
    """
    # Vérifier le tenant
    result = await db.execute(
        select(Tenant).where(
            Tenant.slug == request.tenant_slug,
            Tenant.is_active == True
        )
    )
    tenant = result.scalar_one_or_none()

    if tenant:
        # Trouver l'utilisateur
        result = await db.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.email == request.email
            )
        )
        user = result.scalar_one_or_none()

        if user and user.is_active:
            # Générer le token de réinitialisation
            reset_token = create_reset_token(str(user.id))
            reset_url = f"http://localhost:3000/reset-password?token={reset_token}"

            # En développement: afficher le lien dans les logs
            logger.info(
                "🔑 Lien de réinitialisation de mot de passe",
                email=request.email,
                tenant_slug=request.tenant_slug,
                reset_url=reset_url,
            )
            print(f"\n{'='*60}")
            print(f"🔑 LIEN DE RÉINITIALISATION DE MOT DE PASSE")
            print(f"   Email: {request.email}")
            print(f"   URL:   {reset_url}")
            print(f"{'='*60}\n")

    # Toujours retourner un succès (pas de fuite d'information)
    return {
        "message": "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé."
    }


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Réinitialisation du mot de passe avec un token valide.
    """
    # Vérifier et décoder le token
    user_id = verify_reset_token(request.token)

    # Valider la force du nouveau mot de passe
    if not validate_password_strength(request.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre"
        )

    # Trouver l'utilisateur
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalide"
        )

    # Mettre à jour le mot de passe
    user.hashed_password = get_password_hash(request.new_password)
    await db.commit()

    logger.info(
        "Mot de passe réinitialisé",
        user_id=str(user.id),
        email=user.email,
    )

    return {"message": "Votre mot de passe a été réinitialisé avec succès."}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    # TODO: Implémenter refresh token
):
    """Rafraîchir un token expiré"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Pas encore implémenté"
    )
