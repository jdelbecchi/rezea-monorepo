"""Routes pour la gestion des offres/forfaits"""
from datetime import date
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.models import Offer, UserRole
from app.schemas.schemas import OfferCreate, OfferUpdate, OfferResponse

router = APIRouter()


@router.get("", response_model=List[OfferResponse])
async def list_offers(
    request: Request,
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = False
):
    """
    Liste les offres disponibles
    
    - Public: Seulement les offres actives
    - Admin: Peut voir toutes les offres
    """
    tenant_id = request.state.tenant_id
    today = date.today()
    
    # Désactiver automatiquement les offres dont la date limite est passée
    await db.execute(
        update(Offer)
        .where(
            and_(
                Offer.tenant_id == tenant_id,
                Offer.is_active == True,
                Offer.is_validity_unlimited == False,
                Offer.deadline_date < today
            )
        )
        .values(is_active=False)
    )
    await db.commit()
    
    query = select(Offer).where(Offer.tenant_id == tenant_id)
    
    # Filtrer par statut actif si non-admin
    if not include_inactive:
        query = query.where(Offer.is_active == True)
    
    # Trier par ordre d'affichage
    query = query.order_by(Offer.display_order, Offer.created_at)
    
    result = await db.execute(query)
    offers = result.scalars().all()
    
    return offers


@router.post("", response_model=OfferResponse, status_code=status.HTTP_201_CREATED)
async def create_offer(
    offer_data: OfferCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Crée une nouvelle offre (Admin uniquement)
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Vérifier les permissions (admin/manager)
    from app.models.models import User
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or user.role not in [UserRole.OWNER, UserRole.MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    
    # Créer l'offre
    offer = Offer(
        tenant_id=tenant_id,
        **offer_data.model_dump()
    )
    
    try:
        db.add(offer)
        await db.commit()
        await db.refresh(offer)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une offre avec ce code existe déjà."
        )
    
    return offer


@router.patch("/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: str,
    offer_data: OfferUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Met à jour une offre (Admin uniquement)
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Vérifier les permissions
    from app.models.models import User
    from uuid import UUID
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or user.role not in [UserRole.OWNER, UserRole.MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    
    # Récupérer l'offre
    result = await db.execute(
        select(Offer).where(
            and_(
                Offer.id == UUID(offer_id),
                Offer.tenant_id == tenant_id
            )
        )
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offre non trouvée"
        )
    
    # Mettre à jour les champs fournis
    update_data = offer_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(offer, field, value)
    
    try:
        await db.commit()
        await db.refresh(offer)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une offre avec ce code existe déjà."
        )
    
    return offer


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(
    offer_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Désactive une offre (Admin uniquement)
    
    Note: On ne supprime pas vraiment, on désactive pour garder l'historique
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Vérifier les permissions
    from app.models.models import User
    from uuid import UUID
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or user.role not in [UserRole.OWNER, UserRole.MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    
    # Récupérer et désactiver l'offre
    result = await db.execute(
        select(Offer).where(
            and_(
                Offer.id == UUID(offer_id),
                Offer.tenant_id == tenant_id
            )
        )
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offre non trouvée"
        )
    
    offer.is_active = False
    await db.commit()
    
    return None
