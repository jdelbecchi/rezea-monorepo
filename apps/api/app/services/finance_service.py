
import structlog
from datetime import date
from uuid import UUID
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.models import (
    FinanceTransaction, FinanceTransactionType, FinanceCategory, 
    FinancePaymentMethod, OrderPaymentStatus, Order, EventRegistration
)

logger = structlog.get_logger()

class FinanceService:
    @staticmethod
    async def get_or_create_default_category(db, tenant_id, name, trans_type, color="#0f172a"):
        """Récupère ou crée une catégorie par défaut"""
        result = await db.execute(
            select(FinanceCategory).where(
                FinanceCategory.tenant_id == tenant_id,
                FinanceCategory.name == name
            )
        )
        cat = result.scalar_one_or_none()
        if not cat:
            cat = FinanceCategory(
                tenant_id=tenant_id,
                name=name,
                type=trans_type,
                color=color,
                is_default=True
            )
            db.add(cat)
            await db.flush()
        return cat

    @classmethod
    async def sync_order_to_finance(cls, db, order: Order):
        """
        Crée une entrée en trésorerie pour une commande payée.
        """
        if order.payment_status != OrderPaymentStatus.PAID:
            return
        
        # Éviter les doublons
        existing = await db.execute(
            select(FinanceTransaction).where(FinanceTransaction.order_id == order.id)
        )
        if existing.scalar_one_or_none():
            return

        # Catégorie par défaut pour les ventes d'offres
        cat = await cls.get_or_create_default_category(
            db, order.tenant_id, "Ventes d'offres", FinanceTransactionType.INCOME, color="#059669"
        )
        
        # Mapper le moyen de paiement (Approximation)
        payment_method = FinancePaymentMethod.OTHER
        if order.comment and "Stripe" in order.comment:
            payment_method = FinancePaymentMethod.STRIPE
        
        new_trans = FinanceTransaction(
            tenant_id=order.tenant_id,
            date=date.today(),
            type=FinanceTransactionType.INCOME,
            category_id=cat.id,
            amount_cents=order.price_cents,
            description=f"Commande {order.invoice_number or str(order.id)[:8]} - {order.user.first_name} {order.user.last_name}",
            payment_method=payment_method,
            order_id=order.id,
            is_reconciled=True
        )
        db.add(new_trans)
        logger.info(f"💰 Finance synced for order {order.id}")

    @classmethod
    async def sync_event_registration_to_finance(cls, db, registration: EventRegistration):
        """
        Crée une entrée en trésorerie pour une inscription payée.
        """
        # On accepte PAID ou A_VALIDER (selon la logique Rezea)
        if registration.payment_status != OrderPaymentStatus.PAID:
            return
            
        existing = await db.execute(
            select(FinanceTransaction).where(FinanceTransaction.registration_id == registration.id)
        )
        if existing.scalar_one_or_none():
            return

        cat = await cls.get_or_create_default_category(
            db, registration.tenant_id, "Évènements", FinanceTransactionType.INCOME, color="#8b5cf6"
        )
        
        new_trans = FinanceTransaction(
            tenant_id=registration.tenant_id,
            date=date.today(),
            type=FinanceTransactionType.INCOME,
            category_id=cat.id,
            amount_cents=registration.price_paid_cents,
            description=f"Évènement: {registration.event.title} - {registration.user.first_name} {registration.user.last_name}",
            payment_method=FinancePaymentMethod.OTHER,
            registration_id=registration.id,
            is_reconciled=True
        )
        db.add(new_trans)
        logger.info(f"💰 Finance synced for event reg {registration.id}")
