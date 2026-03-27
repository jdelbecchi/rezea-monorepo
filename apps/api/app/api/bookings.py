"""Routes réservations avec gestion FIFO des crédits"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from uuid import UUID

from app.db.session import get_db
from app.models.models import (
    Booking, Session, CreditAccount, CreditTransaction,
    BookingStatus, CreditTransactionType, WaitlistEntry, WaitlistStatus
)
from app.schemas.schemas import (
    BookingCreate, BookingResponse, BookingListResponse
)
import structlog

logger = structlog.get_logger()
router = APIRouter()


async def consume_credits_fifo(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    amount: float
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
        )
    )
    account = result.scalar_one_or_none()
    
    if not account or account.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Crédits insuffisants (requis: {amount}, disponibles: {account.balance if account else 0})"
        )
    
    # Mettre à jour le solde
    account.balance -= amount
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
    
    # Vérifier la disponibilité
    if session.current_participants >= session.max_participants:
        # Si liste d'attente activée, proposer de s'inscrire
        if session.allow_waitlist:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Séance complète. Voulez-vous rejoindre la liste d'attente?"
            )
        else:
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
    
    try:
        # Consommer les crédits
        transaction_id = await consume_credits_fifo(
            db, tenant_id, user_id, session.credits_required
        )
        
        # Créer la réservation
        booking = Booking(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=booking_data.session_id,
            status=BookingStatus.CONFIRMED,
            credits_used=session.credits_required,
            transaction_id=transaction_id,
            notes=booking_data.notes
        )
        
        db.add(booking)
        
        # Incrémenter le compteur
        session.current_participants += 1
        
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
    
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Réservation déjà annulée"
        )
    
    was_confirmed = booking.status == BookingStatus.CONFIRMED
    
    # Annuler la réservation
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.utcnow()
    booking.cancellation_type = "user"
    
    # Décrémenter le compteur si confirmé
    if was_confirmed:
        session.current_participants = max(0, session.current_participants - 1)
    
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
            account.balance += booking.credits_used
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
            
            # Gérer les crédits du promu
            credits_needed = session.credits_required
            if credits_needed > 0:
                acct_result = await db.execute(
                    select(CreditAccount).where(
                        and_(
                            CreditAccount.tenant_id == tenant_id,
                            CreditAccount.user_id == next_booking.user_id,
                        )
                    )
                )
                next_account = acct_result.scalar_one_or_none()
                if next_account and next_account.balance >= credits_needed:
                    next_account.balance -= credits_needed
                    next_account.total_used += credits_needed
                    tx = CreditTransaction(
                        tenant_id=tenant_id,
                        account_id=next_account.id,
                        transaction_type=CreditTransactionType.BOOKING,
                        amount=-credits_needed,
                        balance_after=next_account.balance,
                        description="Réservation (promotion liste d'attente)",
                        consumed_at=datetime.utcnow(),
                    )
                    db.add(tx)
                    await db.flush()
                    next_booking.transaction_id = tx.id
                    next_booking.credits_used = credits_needed
                else:
                    next_booking.credits_used = 0
            
            logger.info(
                "Promotion automatique liste d'attente",
                promoted_booking_id=str(next_booking.id),
                promoted_user_id=str(next_booking.user_id),
            )
    
    await db.commit()
    
    logger.info(
        "Réservation annulée",
        booking_id=str(booking_id),
        user_id=str(user_id),
        credits_refunded=booking.credits_used
    )
    
    return None

