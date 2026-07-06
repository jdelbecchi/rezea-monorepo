"""Routes réservations avec gestion FIFO des crédits"""
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from uuid import UUID

from app.db.session import get_db
from app.models.models import (
    Booking, Session, CreditAccount, CreditTransaction,
    BookingStatus, CreditTransactionType, WaitlistEntry, WaitlistStatus, Tenant
)
from app.schemas.schemas import (
    BookingCreate, BookingResponse, BookingListResponse
)
import structlog

logger = structlog.get_logger()
router = APIRouter()


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
    
    # 1. Trouver les inscriptions concernées
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
        # Vérifier si un remboursement a déjà été fait (sécurité double remboursement)
        # On regarde s'il existe une transaction REFUND liée à ce booking_id
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
            
        # Procéder à la restitution
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
        await db.commit()
        
    return count


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
    # Récupérer le compte
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
    
    # Créer la transaction
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



@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking_data: BookingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Crée une réservation
    
    1. Vérifie que la séance existe et a de la place
    2. Consomme les crédits (FIFO)
    3. Crée la réservation
    4. Incrémente le compteur de participants
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Vérifier si l'utilisateur est suspendu
    from app.models.models import User
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

    # Charger le service des commandes
    from app.services import orders as order_service

    
    # Récupérer la séance avec verrouillage
    result = await db.execute(
        select(Session)
        .where(
            and_(
                Session.id == booking_data.session_id,
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
    
    # Vérifier la disponibilité (simplifié car géré par le statut)
    if session.current_participants >= session.max_participants and not session.allow_waitlist:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Séance complète"
        )
    
    # Vérifier si l'utilisateur n'a pas déjà une réservation
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.tenant_id == tenant_id,
                Booking.user_id == user_id,
                Booking.session_id == booking_data.session_id,
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

    # --- Vérification du délai d'inscription ---
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
    # -------------------------------------------

    # Déterminer le statut initial
    is_full = session.current_participants >= session.max_participants
    booking_status = BookingStatus.CONFIRMED if not is_full else BookingStatus.PENDING
    
    try:
        # Simuler la file d'attente FIFO en ajoutant la réservation demandée
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
            
        # Consommer les crédits
        transaction_id = await consume_credits_fifo(
            db, tenant_id, user_id, session.credits_required, global_balance
        )

        
        # Créer la réservation
        booking = Booking(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=booking_data.session_id,
            status=booking_status,
            credits_used=session.credits_required,
            transaction_id=transaction_id,
            notes=booking_data.notes
        )
        
        db.add(booking)
        
        # Incrémenter le compteur seulement si confirmé
        if booking_status == BookingStatus.CONFIRMED:
            session.current_participants += 1
        else:
            session.waitlist_count += 1
        
        await db.commit()
        await db.refresh(booking)
        
        logger.info(
            "Réservation créée",
            booking_id=str(booking.id),
            user_id=str(user_id),
            session_id=str(booking_data.session_id)
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


@router.get("", response_model=List[BookingListResponse])
async def list_bookings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    status_filter: BookingStatus = None,
    limit: int = 50
):
    """Liste les réservations de l'utilisateur"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Restitution automatique déplacée vers l'endpoint cron dédié pour de meilleures performances
    pass
    
    # Expirer les crédits expirés si nécessaire (obsolète avec FIFO dynamique)

    
    query = select(Booking, Session).join(
        Session, Booking.session_id == Session.id
    ).where(
        and_(
            Booking.tenant_id == tenant_id,
            Booking.user_id == user_id
        )
    ).order_by(Booking.created_at.desc()).limit(limit)
    
    if status_filter:
        query = query.where(Booking.status == status_filter)
    
    result = await db.execute(query)
    bookings_with_sessions = result.all()
    
    return [
        BookingListResponse(
            booking=BookingResponse.model_validate(booking),
            session=booking_session
        )
        for booking, booking_session in bookings_with_sessions
    ]


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_booking(
    booking_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Annule une réservation et rembourse les crédits"""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    # Récupérer la réservation avec verrouillage
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
    
    # --- Vérification du délai d'annulation ---
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
    # ------------------------------------------
    
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Réservation déjà annulée"
        )
    
    was_confirmed = booking.status == BookingStatus.CONFIRMED
    was_pending = booking.status == BookingStatus.PENDING
    
    # Annuler la réservation
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.utcnow()
    booking.cancellation_type = "user"
    
    # Flusher pour que la simulation de solde lise le nouveau statut CANCELLED
    await db.flush()
    
    # Décrémenter le compteur si confirmé
    if was_confirmed:
        session.current_participants = max(0, session.current_participants - 1)
    elif was_pending:
        session.waitlist_count = max(0, session.waitlist_count - 1)
    
    # Rembourser les crédits
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
            # Recompute global_balance dynamically
            from app.services import orders as order_service
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

    
    # Promotion automatique : promouvoir le 1er en liste d'attente
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
            # Redondant car déjà débité lors de l'entrée en liste d'attente
            
            logger.info(
                "Promotion automatique liste d'attente",
                promoted_booking_id=str(next_booking.id),
                promoted_user_id=str(next_booking.user_id),
            )
            
            # Send promotion email
            from app.services.email_service import EmailService
            from app.models.models import User
            
            user_res = await db.execute(select(User).where(User.id == next_booking.user_id))
            promoted_user = user_res.scalar_one_or_none()
            
            tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
            tenant = tenant_res.scalar_one_or_none()
            
            if promoted_user and tenant:
                background_tasks.add_task(
                    EmailService.send_session_promotion, promoted_user, tenant, session
                )
    
    await db.commit()
    
    logger.info(
        "Réservation annulée",
        booking_id=str(booking_id),
        user_id=str(user_id),
        credits_refunded=booking.credits_used
    )
    
    return None


@router.post("/cron/cleanup-waitlist")
async def cleanup_expired_waitlists(
    db: AsyncSession = Depends(get_db)
):
    """
    Tâche planifiée (cron) pour restituer les crédits des listes d'attente expirées
    sur l'ensemble des tenants de la plateforme.
    """
    result = await db.execute(select(Tenant.id))
    tenant_ids = result.scalars().all()
    
    total_processed = 0
    for tenant_id in tenant_ids:
        processed = await auto_restitute_expired_waitlist(db, tenant_id)
        total_processed += processed
        
    return {"status": "success", "processed_bookings_count": total_processed}

