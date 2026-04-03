"""
API Boutique - Côté Utilisateur
"""
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.models import Order, Offer, OrderPaymentStatus, Tenant, CreditAccount, CreditTransaction, CreditTransactionType
from app.schemas.schemas import ShopCheckoutRequest, ShopCheckoutResponse, OrderResponse

router = APIRouter()

def compute_end_date(offer: Offer, start_date: date) -> Optional[date]:
    """Calcule la date de fin en fonction de l'offre. None si illimitée."""
    if offer.is_validity_unlimited:
        return None
    if offer.validity_days:
        if offer.validity_unit == "months":
            return start_date + relativedelta(months=offer.validity_days)
        return start_date + timedelta(days=offer.validity_days)
    if offer.deadline_date:
        return offer.deadline_date
    # Fallback: 1 an
    return start_date + timedelta(days=365)

@router.post("/checkout", response_model=ShopCheckoutResponse)
async def shop_checkout(
    checkout: ShopCheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Finalise une commande (checkout).
    Si pay_later est vrai, la commande est créée en statut 'en_attente'.
    Sinon, elle est créée en statut 'a_valider' et on renvoie un lien de paiement.
    Les crédits sont provisionnés immédiatement dans tous les cas.
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    # 1. Récupérer l'offre
    result = await db.execute(
        select(Offer).where(
            and_(
                Offer.id == checkout.offer_id,
                Offer.tenant_id == tenant_id,
                Offer.is_active == True
            )
        )
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offre non trouvée ou inactive")

    # 2. Récupérer le tenant pour les paramètres
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    # 3. Créer la commande
    start_date = checkout.start_date or date.today()
    end_date = compute_end_date(offer, start_date)
    
    # Statut paiement selon choix
    payment_status = OrderPaymentStatus.WAITING if checkout.pay_later else OrderPaymentStatus.PENDING
    
    order = Order(
        tenant_id=tenant_id,
        user_id=user_id,
        offer_id=offer.id,
        start_date=start_date,
        end_date=end_date,
        is_validity_unlimited=offer.is_validity_unlimited,
        credits_total=offer.classes_included,
        is_unlimited=offer.is_unlimited,
        price_cents=offer.price_lump_sum_cents or offer.price_recurring_cents or 0,
        payment_status=payment_status,
        status="en_cours",
        created_by_admin=False,
        # Snapshot des infos de l'offre
        offer_snap_name=offer.name,
        offer_snap_description=offer.description,
        offer_snap_validity_days=offer.validity_days,
        offer_snap_validity_unit=offer.validity_unit,
        offer_snap_is_validity_unlimited=offer.is_validity_unlimited
    )
    
    db.add(order)
    
    # 3.5 Créditer le compte immédiatement (Règle métier : le paiement ne bloque pas les crédits)
    # Récupérer ou créer le compte de crédits
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
        account = CreditAccount(
            tenant_id=tenant_id,
            user_id=user_id,
            balance=0,
            total_purchased=0,
            total_used=0
        )
        db.add(account)
        await db.flush() # Pour avoir l'ID
    
    # Mettre à jour le solde
    amount_to_add = offer.classes_included or 0 # TODO: Gérer l'illimité si besoin, mais ici on ajoute au solde numérique
    account.balance += amount_to_add
    account.total_purchased += amount_to_add
    
    # Créer la transaction
    transaction = CreditTransaction(
        tenant_id=tenant_id,
        account_id=account.id,
        transaction_type=CreditTransactionType.PURCHASE,
        amount=amount_to_add,
        balance_after=account.balance,
        description=f"Achat: {offer.name}",
        reference=str(order.id),
        offer_id=offer.id
    )
    db.add(transaction)
    
    await db.commit()
    await db.refresh(order)

    # 4. Préparer la réponse avec les messages personnalisés
    # On recharge la commande pour avoir les jointures (nécessaire pour OrderResponse)
    result = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(joinedload(Order.user), joinedload(Order.offer))
    )
    order = result.unique().scalar_one()

    # Message et URL selon le mode de paiement
    if checkout.pay_later:
        message = tenant.confirmation_email_body or "Votre commande a été enregistrée. Merci de procéder au paiement selon les modalités de l'établissement."
        redirect_url = None # Redirigera vers "Mes commandes" côté front
    else:
        message = tenant.pay_now_instructions or "Vous allez être redirigé vers l'interface de paiement."
        redirect_url = tenant.payment_redirect_link

    # On utilise la structure de OrderResponse simplifiée (sans crédits consommés pour l'instant car commande neuve)
    order_res = OrderResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        user_id=order.user_id,
        offer_id=order.offer_id,
        start_date=order.start_date,
        end_date=order.end_date,
        is_validity_unlimited=order.is_validity_unlimited,
        credits_total=order.credits_total,
        is_unlimited=order.is_unlimited,
        price_cents=order.price_cents,
        payment_status=order.payment_status,
        comment=order.comment,
        created_by_admin=order.created_by_admin,
        created_at=order.created_at,
        updated_at=order.updated_at,
        invoice_number=order.invoice_number,
        invoice_url=order.invoice_url,
        user_name=f"{order.user.first_name} {order.user.last_name}" if order.user else "Utilisateur supprimé",
        user_email=order.user.email if (order.user and order.user.email) else "",
        offer_code=order.offer.offer_code if order.offer else "",
        offer_name=order.offer.name if order.offer else (order.offer_snap_name or "Offre inconnue"),
        offer_period=order.offer.period if order.offer else None,
        offer_featured_pricing=order.offer.featured_pricing if order.offer else None,
        offer_price_recurring_cents=order.offer.price_recurring_cents if order.offer else None,
        offer_price_lump_sum_cents=order.offer.price_lump_sum_cents if order.offer else None,
        offer_recurring_count=order.offer.recurring_count if order.offer else None,
        credits_used=0,
        balance=order.credits_total,
        status=order.status or "en_cours",
        # Snapshots
        offer_snap_name=order.offer_snap_name,
        offer_snap_description=order.offer_snap_description,
        offer_snap_validity_days=order.offer_snap_validity_days,
        offer_snap_validity_unit=order.offer_snap_validity_unit,
        offer_snap_is_validity_unlimited=order.offer_snap_is_validity_unlimited or False
    )

    return ShopCheckoutResponse(
        order=order_res,
        message=message,
        redirect_url=redirect_url
    )

@router.get("/orders", response_model=List[OrderResponse])
async def list_my_orders(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Liste les commandes de l'utilisateur connecté
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    result = await db.execute(
        select(Order)
        .where(
            and_(
                Order.tenant_id == tenant_id,
                Order.user_id == user_id
            )
        )
        .options(joinedload(Order.offer), joinedload(Order.user))
        .order_by(Order.created_at.desc())
    )
    
    orders = result.unique().scalars().all()
    
    # Mapper vers OrderResponse
    res = []
    for order in orders:
        res.append(OrderResponse(
            id=order.id,
            tenant_id=order.tenant_id,
            user_id=order.user_id,
            offer_id=order.offer_id,
            start_date=order.start_date,
            end_date=order.end_date,
            is_validity_unlimited=order.is_validity_unlimited,
            credits_total=order.credits_total,
            is_unlimited=order.is_unlimited,
            price_cents=order.price_cents,
            payment_status=order.payment_status,
            comment=order.comment,
            created_by_admin=order.created_by_admin,
            created_at=order.created_at,
            updated_at=order.updated_at,
            invoice_number=order.invoice_number,
            invoice_url=order.invoice_url,
            user_name=f"{order.user.first_name} {order.user.last_name}" if order.user else "Utilisateur supprimé",
            user_email=order.user.email if (order.user and order.user.email) else "",
            offer_code=order.offer.offer_code if order.offer else "",
            offer_name=order.offer.name if order.offer else (order.offer_snap_name or "Offre inconnue"),
            offer_period=order.offer.period if order.offer else None,
            offer_featured_pricing=order.offer.featured_pricing if order.offer else None,
            offer_price_recurring_cents=order.offer.price_recurring_cents if order.offer else None,
            offer_price_lump_sum_cents=order.offer.price_lump_sum_cents if order.offer else None,
            offer_recurring_count=order.offer.recurring_count if order.offer else None,
            credits_used=0,
            balance=order.credits_total,
            status=order.status or "en_cours",
            # Snapshots
            offer_snap_name=order.offer_snap_name,
            offer_snap_description=order.offer_snap_description,
            offer_snap_validity_days=order.offer_snap_validity_days,
            offer_snap_validity_unit=order.offer_snap_validity_unit,
            offer_snap_is_validity_unlimited=order.offer_snap_is_validity_unlimited or False
        ))
    
    return res
