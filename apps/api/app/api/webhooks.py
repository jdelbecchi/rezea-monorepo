"""Routes pour les webhooks externes"""
from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import logging

from app.db.session import get_db
from app.models.models import CreditAccount, CreditTransaction, CreditTransactionType
from app.services.helloasso import helloasso_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/helloasso")
async def helloasso_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Webhook HelloAsso pour recevoir les notifications de paiement
    
    Documentation: https://dev.helloasso.com/docs/notifications
    """
    # Récupérer le corps de la requête
    body = await request.body()
    body_str = body.decode('utf-8')
    
    # Vérifier la signature (si configurée)
    signature = request.headers.get('X-HelloAsso-Signature', '')
    if not helloasso_service.verify_webhook_signature(body_str, signature):
        logger.warning("Invalid HelloAsso webhook signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature"
        )
    
    # Parser le JSON
    import json
    try:
        data = json.loads(body_str)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON"
        )
    
    event_type = data.get('eventType')
    logger.info(f"Received HelloAsso webhook: {event_type}")
    
    # Traiter selon le type d'événement
    if event_type == 'Order':
        await handle_order_event(data, db)
    elif event_type == 'Payment':
        await handle_payment_event(data, db)
    else:
        logger.info(f"Unhandled event type: {event_type}")
    
    return {"status": "ok"}


async def handle_order_event(data: dict, db: AsyncSession):
    """Traite un événement Order (commande créée et payée)"""
    order_data = data.get('data', {})
    
    # Récupérer les métadonnées
    metadata = order_data.get('metadata', {})
    transaction_id = metadata.get('transaction_id')
    
    if not transaction_id:
        logger.warning("No transaction_id in order metadata")
        return
    
    # Récupérer la transaction
    from uuid import UUID
    result = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.id == UUID(transaction_id)
        )
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        logger.error(f"Transaction {transaction_id} not found")
        return
    
    # Vérifier que le paiement est confirmé
    order_state = order_data.get('state')
    if order_state != 'Authorized':
        logger.info(f"Order state is {order_state}, waiting for Authorized")
        return
    
    # Récupérer le compte de crédits
    result = await db.execute(
        select(CreditAccount).where(
            CreditAccount.id == transaction.account_id
        )
    )
    account = result.scalar_one_or_none()
    
    if not account:
        logger.error(f"Account {transaction.account_id} not found")
        return
    
    # Mettre à jour le solde
    account.balance += transaction.amount
    account.total_purchased += transaction.amount
    transaction.balance_after = account.balance
    
    # Mettre à jour les informations de paiement
    transaction.payment_id = order_data.get('id')
    
    await db.commit()
    logger.info(f"Credits added: {transaction.amount} credits to account {account.id}")


async def handle_payment_event(data: dict, db: AsyncSession):
    """Traite un événement Payment"""
    # Similar logic to handle_order_event
    # HelloAsso peut envoyer soit Order soit Payment
    await handle_order_event(data, db)
