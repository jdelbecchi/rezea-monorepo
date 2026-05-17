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
from sqlalchemy.orm import joinedload, selectinload

from app.db.session import get_db
from app.models.models import Order, Offer, OrderPaymentStatus, Tenant, CreditAccount, CreditTransaction, CreditTransactionType, Installment
from app.schemas.schemas import ShopCheckoutRequest, ShopCheckoutResponse, OrderResponse
from app.services import orders as order_service

router = APIRouter()

# (Removed: compute_end_date - now in order_service)


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
    end_date = order_service.compute_end_date(offer, start_date)
    
    # Statut paiement selon choix ou lien disponible
    # Si aucun lien de redirection, on force le paiement différé
    is_link_missing = not tenant.payment_redirect_link
    is_pay_later_allowed = tenant.allow_pay_later_offers
    effective_pay_later = (checkout.pay_later and is_pay_later_allowed) or is_link_missing
    
    # Determine price and payment status based on chosen pricing_type
    if checkout.pricing_type == "recurring" and offer.price_recurring_cents:
        price_cents = offer.price_recurring_cents
        payment_status = OrderPaymentStatus.INSTALLMENT
    else:
        price_cents = offer.price_lump_sum_cents or offer.price_recurring_cents or 0
        payment_status = OrderPaymentStatus.WAITING if effective_pay_later else OrderPaymentStatus.PENDING

    order = Order(
        tenant_id=tenant_id,
        user_id=user_id,
        offer_id=offer.id,
        start_date=start_date,
        end_date=end_date,
        is_validity_unlimited=offer.is_validity_unlimited,
        credits_total=offer.classes_included,
        is_unlimited=offer.is_unlimited,
        price_cents=price_cents,
        payment_status=payment_status,
        status="active",
        created_by_admin=False,
        # Snapshot des infos de l'offre
        offer_snap_name=offer.name,
        offer_snap_description=offer.description,
        offer_snap_validity_days=offer.validity_days,
        offer_snap_validity_unit=offer.validity_unit,
        offer_snap_is_validity_unlimited=offer.is_validity_unlimited
    )
    
    db.add(order)
    await db.flush() # Get order.id for installments
    
    # 3.2 Create installments if recurring
    if checkout.pricing_type == "recurring" and offer.price_recurring_cents and offer.recurring_count:
        for i in range(offer.recurring_count):
            due_date = start_date + relativedelta(months=i)
            installment = Installment(
                tenant_id=tenant_id,
                order_id=order.id,
                due_date=due_date,
                amount_cents=offer.price_recurring_cents,
                is_paid=False
            )
            db.add(installment)
    
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
        .options(joinedload(Order.user), joinedload(Order.offer), selectinload(Order.installments))
    )
    order = result.unique().scalar_one()
    
    # 3.8 Envoi de l'email de confirmation
    try:
        from app.services.email_service import EmailService
        await EmailService.send_order_receipt(order.user, tenant, order, offer.name)
    except Exception as e:
        # On log l'erreur mais on ne bloque pas la réponse API
        logger.error("❌ Erreur lors de l'envoi de l'email de confirmation", error=str(e), order_id=str(order.id))

    # 3.9 Synchronisation trésorerie
    try:
        from app.services.finance_service import FinanceService
        await FinanceService.sync_order_to_finance(db, order)
    except Exception as e:
        logger.error("❌ Erreur synchronisation trésorerie", error=str(e), order_id=str(order.id))

    # Message et URL selon le mode de paiement
    if effective_pay_later:
        message = tenant.confirmation_email_body or "Le réglement de votre commande sera à effectuer selon les modalités de l'établissement"
        if is_link_missing:
            message = "Le réglement de votre commande sera à effectuer selon les modalités de l'établissement"
        redirect_url = None # Redirigera vers "Mes commandes" côté front
    else:
        message = tenant.pay_now_instructions or "Vous allez être redirigé vers l'interface de paiement."
        redirect_url = tenant.payment_redirect_link

    # Get global balance
    account_res = await db.execute(
        select(CreditAccount).where(CreditAccount.user_id == order.user_id, CreditAccount.tenant_id == order.tenant_id)
    )
    account = account_res.scalar_one_or_none()
    global_balance = float(account.balance) if account else 0.0
    global_used = int(account.total_used) if account else 0

    # Use shared service to build response
    order_res = order_service.build_order_response(
        order, 
        credits_used=0,
        global_balance=global_balance,
        global_credits_used=global_used
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
        .options(joinedload(Order.offer), joinedload(Order.user), selectinload(Order.installments))
        .order_by(Order.created_at.desc())
    )
    
    orders = result.unique().scalars().all()
    
    # Get global balance for the user
    account_res = await db.execute(
        select(CreditAccount).where(CreditAccount.user_id == user_id, CreditAccount.tenant_id == tenant_id)
    )
    account = account_res.scalar_one_or_none()
    global_balance = float(account.balance) if account else 0.0
    global_used = int(account.total_used) if account else 0

    # Mapper vers OrderResponse en utilisant le service partagé
    res = [
        order_service.build_order_response(
            order, 
            credits_used=0, 
            global_balance=global_balance,
            global_credits_used=global_used
        )
        for order in orders
    ]
    
    return res
