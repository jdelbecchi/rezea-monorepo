"""Routes gestion des crédits"""
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.db.session import get_db
from app.models.models import CreditAccount, CreditTransaction
from app.schemas.schemas import (
    CreditAccountResponse,
    CreditTransactionResponse,
    CreditPurchaseRequest,
    CreditPurchaseResponse
)

router = APIRouter()


@router.get("/account", response_model=CreditAccountResponse)
async def get_credit_account(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Récupère le compte de crédits de l'utilisateur"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    result = await db.execute(
        select(CreditAccount).where(
            and_(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == user_id
            )
        )
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compte de crédits non trouvé"
        )
    
    return account


@router.get("/transactions", response_model=List[CreditTransactionResponse])
async def list_transactions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    """Liste l'historique des transactions"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Récupérer le compte
    result = await db.execute(
        select(CreditAccount).where(
            and_(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == user_id
            )
        )
    )
    account = result.scalar_one_or_none()
    
    if not account:
        return []
    
    # Récupérer les transactions
    result = await db.execute(
        select(CreditTransaction)
        .where(
            and_(
                CreditTransaction.tenant_id == tenant_id,
                CreditTransaction.account_id == account.id
            )
        )
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
    )
    
    transactions = result.scalars().all()
    return transactions


@router.post("/purchase", response_model=CreditPurchaseResponse)
async def purchase_credits(
    purchase: CreditPurchaseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Initie un achat de crédits via une offre HelloAsso
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Récupérer l'offre
    from app.models.models import User, Offer
    result = await db.execute(
        select(Offer).where(
            and_(
                Offer.id == purchase.offer_id,
                Offer.tenant_id == tenant_id,
                Offer.is_active == True
            )
        )
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offre non trouvée ou inactive"
        )
    
    # Récupérer l'utilisateur pour ses informations
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    # Récupérer le compte de crédits
    result = await db.execute(
        select(CreditAccount).where(
            and_(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == user_id
            )
        )
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compte de crédits non trouvé"
        )
    
    # Créer une transaction en attente
    from app.models.models import CreditTransactionType
    transaction = CreditTransaction(
        tenant_id=tenant_id,
        account_id=account.id,
        transaction_type=CreditTransactionType.PURCHASE,
        amount=offer.classes_included,  # Nombre de cours de l'offre
        balance_after=account.balance,  # Sera mis à jour lors du callback
        description=f"Achat de {offer.name} ({offer.classes_included} cours)",
        payment_provider=purchase.payment_provider,
        offer_id=offer.id
    )
    
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    
    # Intégration HelloAsso
    if purchase.payment_provider == "helloasso":
        from app.services.helloasso import helloasso_service
        
        try:
            checkout_data = await helloasso_service.create_checkout_intent(
                amount_cents=offer.price_lump_sum_cents or offer.price_recurring_cents or 0,
                user_email=user.email,
                user_first_name=user.first_name,
                user_last_name=user.last_name,
                metadata={
                    "transaction_id": str(transaction.id),
                    "user_id": str(user_id),
                    "tenant_id": str(tenant_id),
                    "offer_id": str(offer.id),
                    "offer_name": offer.name,
                    "classes": offer.classes_included
                }
            )
            
            # Mettre à jour la transaction avec l'ID HelloAsso
            transaction.payment_id = checkout_data["checkout_id"]
            await db.commit()
            
            return CreditPurchaseResponse(
                transaction_id=transaction.id,
                amount=offer.classes_included,
                payment_url=checkout_data["redirect_url"],
                payment_id=checkout_data["checkout_id"]
            )
            
        except Exception as e:
            # En cas d'erreur, supprimer la transaction
            await db.delete(transaction)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erreur lors de la création du paiement: {str(e)}"
            )
    
    else:
        # Stripe ou autre provider
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider {purchase.payment_provider} non supporté pour le moment"
        )
