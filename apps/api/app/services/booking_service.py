from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from uuid import UUID
import structlog

from app.models.models import (
    Booking, Session, CreditAccount, CreditTransaction,
    BookingStatus, CreditTransactionType, Tenant, User
)

from app.services import orders as order_service
from app.services.email_service import EmailService

logger = structlog.get_logger()

class BookingService:

    @staticmethod
    async def auto_restitute_expired_waitlist(
        db: AsyncSession,
        tenant_id: UUID,
        user_id: Optional[UUID] = None
    ) -> int:
        """
        Identifie les inscriptions 'pending' pour des séances passées et restitue les crédits.
        Retourne le nombre d'inscriptions traitées.
        """
        now = datetime.utcnow()
        
        query = (
            select(Booking)
            .join(Session, Booking.session_id == Session.id)
            .where(
                and_(
                    Booking.tenant_id == tenant_id,
                    Booking.status == BookingStatus.PENDING,
                    Session.start_time < now
                )
            )
        )
        if user_id:
            query = query.where(Booking.user_id == user_id)
            
        result = await db.execute(query)
        expired_bookings = result.scalars().all()
        
        count = 0
        for booking in expired_bookings:
            tx_check = await db.execute(
                select(CreditTransaction).where(
                    and_(
                        CreditTransaction.tenant_id == tenant_id,
                        CreditTransaction.transaction_type == CreditTransactionType.REFUND,
                        CreditTransaction.reference == str(booking.id)
                    )
                )
            )
            if tx_check.scalar_one_or_none():
                continue
                
            if booking.credits_used > 0:
                acct_result = await db.execute(
                    select(CreditAccount).where(
                        and_(
                            CreditAccount.tenant_id == tenant_id,
                            CreditAccount.user_id == booking.user_id
                        )
                    )
                )
                account = acct_result.scalar_one_or_none()
                if account:
                    account.balance += booking.credits_used
                    account.total_used -= booking.credits_used
                    
                    tx = CreditTransaction(
                        tenant_id=tenant_id,
                        account_id=account.id,
                        transaction_type=CreditTransactionType.REFUND,
                        amount=booking.credits_used,
                        balance_after=account.balance,
                        description=f"Restitution automatique (Liste d'attente expirée)",
                        reference=str(booking.id),
                        consumed_at=now
                    )
                    db.add(tx)
                    booking.status = BookingStatus.CANCELLED
                    booking.cancelled_at = now
                    booking.cancellation_type = "system_expiration"
                    count += 1
                    
        if count > 0:
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise
            
        return count

    @staticmethod
    async def consume_credits_fifo(
        db: AsyncSession,
        tenant_id: UUID,
        user_id: UUID,
        amount: float,
        new_balance: float
    ) -> UUID:
        """
        Consomme des crédits selon la logique FIFO
        Retourne l'ID de la transaction créée
        """
        result = await db.execute(
            select(CreditAccount).where(
                and_(
                    CreditAccount.tenant_id == tenant_id,
                    CreditAccount.user_id == user_id
                )
            ).with_for_update()
        )
        account = result.scalar_one_or_none()
        
        if not account:
            account = CreditAccount(
                tenant_id=tenant_id,
                user_id=user_id,
                balance=new_balance,
                total_purchased=0,
                total_used=amount
            )
            db.add(account)
            await db.flush()
        else:
            account.balance = new_balance
            account.total_used += amount
        
        transaction = CreditTransaction(
            tenant_id=tenant_id,
            account_id=account.id,
            transaction_type=CreditTransactionType.BOOKING,
            amount=-amount,
            balance_after=account.balance,
            description=f"Réservation de séance",
            consumed_at=datetime.utcnow()
        )
        
        db.add(transaction)
        await db.flush()
        
        return transaction.id

    @staticmethod
    async def create_booking(
        db: AsyncSession,
        tenant_id: UUID,
        user_id: UUID,
        session_id: UUID,
        notes: str = None
    ) -> Booking:
        user_res = await db.execute(select(User).where(User.id == user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur non trouvé"
            )
        if user.is_suspended:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vos crédits sont suspendus ou bloqués."
            )

        result = await db.execute(
            select(Session)
            .where(
                and_(
                    Session.id == session_id,
                    Session.tenant_id == tenant_id,
                    Session.is_active == True
                )
            )
            .with_for_update()
        )
        session = result.scalar_one_or_none()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Séance non trouvée"
            )
        
        if session.current_participants >= session.max_participants and not session.allow_waitlist:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Séance complète"
            )
        
        result = await db.execute(
            select(Booking).where(
                and_(
                    Booking.tenant_id == tenant_id,
                    Booking.user_id == user_id,
                    Booking.session_id == session_id,
                    Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED])
                )
            )
        )
        existing_booking = result.scalar_one_or_none()
        
        if existing_booking:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vous avez déjà une réservation pour cette séance"
            )

        tenant_res = await db.execute(select(Tenant.registration_limit_mins).where(Tenant.id == tenant_id))
        reg_limit_mins = tenant_res.scalar() or 0
        
        now = datetime.utcnow()
        reg_limit_time = session.start_time - timedelta(minutes=reg_limit_mins)
        if now > reg_limit_time:
            detail = "Le délai d'inscription est dépassé."
            if reg_limit_mins > 0:
                detail = f"Le délai d'inscription est dépassé ({reg_limit_mins} min avant le début)."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail
            )

        is_full = session.current_participants >= session.max_participants
        booking_status = BookingStatus.CONFIRMED if not is_full else BookingStatus.PENDING
        
        try:
            orders_balances, global_balance, success, _, _, _ = await order_service.compute_fifo_balances(
                db,
                user_id,
                tenant_id,
                bookings_to_add=[{
                    "id": "new_booking",
                    "date": session.start_time.date(),
                    "credits": session.credits_required,
                    "activity_type": session.activity_type,
                    "is_pending": booking_status == BookingStatus.PENDING
                }]
            )
            if not success:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Crédits insuffisants ou expirés pour cette date"
                )
                
            transaction_id = await BookingService.consume_credits_fifo(
                db, tenant_id, user_id, session.credits_required, global_balance
            )
            
            booking = Booking(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=session_id,
                status=booking_status,
                credits_used=session.credits_required,
                transaction_id=transaction_id,
                notes=notes
            )
            
            db.add(booking)
            
            if booking_status == BookingStatus.CONFIRMED:
                session.current_participants += 1
            else:
                session.waitlist_count += 1
            
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise
            await db.refresh(booking)
            
            logger.info(
                "Réservation créée",
                booking_id=str(booking.id),
                user_id=str(user_id),
                session_id=str(session_id)
            )
            
            return booking
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error("Erreur création réservation", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erreur lors de la réservation"
            )

    @staticmethod
    async def cancel_booking(
        db: AsyncSession,
        tenant_id: UUID,
        user_id: UUID,
        booking_id: UUID,
        background_tasks: BackgroundTasks,
        redis_pool = None
    ) -> None:
        result = await db.execute(
            select(Booking, Session)
            .join(Session, Booking.session_id == Session.id)
            .where(
                and_(
                    Booking.id == booking_id,
                    Booking.tenant_id == tenant_id,
                    Booking.user_id == user_id
                )
            )
            .with_for_update()
        )
        booking_with_session = result.one_or_none()
        
        if not booking_with_session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Réservation non trouvée"
            )
        
        booking, session = booking_with_session
        
        result = await db.execute(select(Tenant.cancellation_limit_mins).where(Tenant.id == tenant_id))
        limit_mins = result.scalar() or 0
        
        now = datetime.utcnow()
        limit_time = session.start_time - timedelta(minutes=limit_mins)
        if now > limit_time:
            detail = "Le délai d'annulation est dépassé."
            if limit_mins > 0:
                detail = f"Le délai d'annulation est dépassé ({limit_mins} min avant le début)."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail
            )
        
        if booking.status == BookingStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Réservation déjà annulée"
            )
        
        was_confirmed = booking.status == BookingStatus.CONFIRMED
        was_pending = booking.status == BookingStatus.PENDING
        
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = datetime.utcnow()
        booking.cancellation_type = "user"
        
        await db.flush()
        
        if was_confirmed:
            session.current_participants = max(0, session.current_participants - 1)
        elif was_pending:
            session.waitlist_count = max(0, session.waitlist_count - 1)
        
        if booking.credits_used > 0:
            result = await db.execute(
                select(CreditAccount).where(
                    and_(
                        CreditAccount.tenant_id == tenant_id,
                        CreditAccount.user_id == user_id
                    )
                )
            )
            account = result.scalar_one_or_none()
            
            if account:
                _, global_balance, _, _, _, _ = await order_service.compute_fifo_balances(db, user_id, tenant_id)
                
                account.balance = global_balance
                account.total_used -= booking.credits_used
                
                refund_transaction = CreditTransaction(
                    tenant_id=tenant_id,
                    account_id=account.id,
                    transaction_type=CreditTransactionType.REFUND,
                    amount=booking.credits_used,
                    balance_after=account.balance,
                    description="Remboursement réservation annulée",
                    reference=str(booking.id)
                )
                db.add(refund_transaction)

        if was_confirmed:
            next_result = await db.execute(
                select(Booking)
                .where(
                    and_(
                        Booking.tenant_id == tenant_id,
                        Booking.session_id == session.id,
                        Booking.status == BookingStatus.PENDING,
                    )
                )
                .order_by(Booking.created_at.asc())
                .limit(1)
            )
            next_booking = next_result.scalar_one_or_none()
            
            if next_booking:
                next_booking.status = BookingStatus.CONFIRMED
                session.current_participants += 1
                session.waitlist_count = max(0, session.waitlist_count - 1)
                
                logger.info(
                    "Promotion automatique liste d'attente",
                    promoted_booking_id=str(next_booking.id),
                    promoted_user_id=str(next_booking.user_id),
                )
                
                user_res = await db.execute(select(User).where(User.id == next_booking.user_id))
                promoted_user = user_res.scalar_one_or_none()
                
                tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
                tenant = tenant_res.scalar_one_or_none()
                
                if promoted_user and tenant:
                    if redis_pool:
                        # Use ARQ Worker
                        await redis_pool.enqueue_job(
                            'send_session_promotion_task', 
                            str(promoted_user.id), 
                            str(tenant.id), 
                            str(session.id)
                        )
                    else:
                        # Fallback to BackgroundTasks
                        background_tasks.add_task(
                            EmailService.send_session_promotion, promoted_user, tenant, session
                        )
        
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        
        logger.info(
            "Réservation annulée",
            booking_id=str(booking_id),
            user_id=str(user_id),
            credits_refunded=booking.credits_used
        )
