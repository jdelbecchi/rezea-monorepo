"""Routes planning des séances"""
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.models import Session, Booking, BookingStatus, CreditAccount, CreditTransaction, CreditTransactionType
from app.schemas.schemas import SessionResponse, SessionCreate, SessionUpdate, SessionDuplicateRequest
from uuid import UUID

router = APIRouter()


@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    start_date: datetime = Query(None),
    end_date: datetime = Query(None),
    activity_type: str = Query(None),
    available_only: bool = Query(False),
    status_filter: str = Query("active", alias="status")
):
    """
    Liste les séances du planning
    
    Paramètres:
    - start_date: Date de début (défaut: maintenant)
    - end_date: Date de fin (défaut: start_date + 7 jours)
    - activity_type: Filtrer par type d'activité
    - available_only: Afficher uniquement les séances avec places disponibles
    """
    tenant_id = request.state.tenant_id
    
    # Dates par défaut
    if not start_date:
        start_date = datetime.utcnow()
    if not end_date:
        end_date = start_date + timedelta(days=7)
    
    # Construction de la requête
    query = select(Session).where(
        and_(
            Session.tenant_id == tenant_id,
            Session.start_time >= start_date,
            Session.start_time <= end_date
        )
    ).order_by(Session.start_time)

    # Filtre par statut
    if status_filter == "active":
        query = query.where(Session.is_active == True)
    elif status_filter == "cancelled":
        query = query.where(Session.is_active == False)
    # else: "all", no filter on is_active
    
    if activity_type:
        query = query.where(Session.activity_type == activity_type)
    
    if available_only:
        query = query.where(Session.current_participants < Session.max_participants)
    
    result = await db.execute(query)
    sessions = result.scalars().all()
    
    # Convertir en SessionResponse avec champs calculés
    return [SessionResponse.model_validate(session) for session in sessions]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Récupère une séance par son ID"""
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Session).where(
            and_(
                Session.id == session_id,
                Session.tenant_id == tenant_id
            )
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    return SessionResponse.model_validate(session)


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: SessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Crée une nouvelle séance
    
    Réservé aux admins et managers
    """
    tenant_id = request.state.tenant_id
    
    # Vérification des horaires
    if session_data.end_time <= session_data.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'heure de fin doit être après l'heure de début"
        )
    
    session_dict = session_data.model_dump()
    if session_dict.get('start_time') and session_dict['start_time'].tzinfo:
        session_dict['start_time'] = session_dict['start_time'].replace(tzinfo=None)
    if session_dict.get('end_time') and session_dict['end_time'].tzinfo:
        session_dict['end_time'] = session_dict['end_time'].replace(tzinfo=None)
    
    # Créer la séance
    new_session = Session(
        tenant_id=tenant_id,
        **session_dict
    )
    
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    
    return SessionResponse.model_validate(new_session)


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: UUID,
    update_data: SessionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Met à jour une séance
    
    Réservé aux admins et managers
    """
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Session).where(
            and_(
                Session.id == session_id,
                Session.tenant_id == tenant_id
            )
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    # Mise à jour des champs
    update_dict = update_data.model_dump(exclude_unset=True)
    if update_dict.get('start_time') and update_dict['start_time'].tzinfo:
        update_dict['start_time'] = update_dict['start_time'].replace(tzinfo=None)
    if update_dict.get('end_time') and update_dict['end_time'].tzinfo:
        update_dict['end_time'] = update_dict['end_time'].replace(tzinfo=None)
        
    for field, value in update_dict.items():
        setattr(session, field, value)
    
    await db.commit()
    await db.refresh(session)
    
    return SessionResponse.model_validate(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Désactive une séance (soft delete)
    
    Réservé aux admins
    """
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Session).where(
            and_(
                Session.id == session_id,
                Session.tenant_id == tenant_id
            )
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    # Soft delete (ou annulation sans remboursement si on veut juste masquer)
    # Note: On utilise cancel_session pour une annulation propre avec remboursement
    session.is_active = False
    await db.commit()
    
    return None


@router.post("/{session_id}/cancel", response_model=SessionResponse)
async def cancel_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Annule une séance, marque les inscriptions comme 'Séance annulée' 
    et rembourse les crédits utilisés.
    """
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Session)
        .where(and_(Session.id == session_id, Session.tenant_id == tenant_id))
        .options(selectinload(Session.bookings))
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    if not session.is_active:
        return SessionResponse.model_validate(session)
        
    session.is_active = False
    
    # Gérer les inscriptions
    for booking in session.bookings:
        if booking.status in [BookingStatus.CONFIRMED, BookingStatus.PENDING]:
            # Remboursement si crédits utilisés
            if booking.credits_used > 0:
                # Trouver le compte de crédits
                acct_result = await db.execute(
                    select(CreditAccount).where(
                        and_(
                            CreditAccount.user_id == booking.user_id,
                            CreditAccount.tenant_id == tenant_id
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
                        description=f"Remboursement : séance '{session.title}' annulée",
                        reference=str(booking.id)
                    )
                    db.add(tx)
            
            booking.status = BookingStatus.SESSION_CANCELLED
    
    await db.commit()
    await db.refresh(session)
    
    return SessionResponse.model_validate(session)


import structlog
logger = structlog.get_logger()

@router.post("/{session_id}/reactivate", response_model=SessionResponse)
async def reactivate_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Réactive une séance annulée et tente de restaurer les inscriptions.
    """
    tenant_id = request.state.tenant_id
    
    result = await db.execute(
        select(Session)
        .where(and_(Session.id == session_id, Session.tenant_id == tenant_id))
        .options(selectinload(Session.bookings))
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    if session.is_active:
        return SessionResponse.model_validate(session)
        
    session.is_active = True
    
    # Restaurer les inscriptions qui étaient 'session_cancelled'
    for booking in session.bookings:
        if booking.status == BookingStatus.SESSION_CANCELLED:
            # Re-consommer les crédits
            if booking.credits_used > 0:
                acct_result = await db.execute(
                    select(CreditAccount).where(
                        and_(
                            CreditAccount.user_id == booking.user_id,
                            CreditAccount.tenant_id == tenant_id
                        )
                    )
                )
                account = acct_result.scalar_one_or_none()
                if account and account.balance >= booking.credits_used:
                    account.balance -= booking.credits_used
                    account.total_used += booking.credits_used
                    
                    tx = CreditTransaction(
                        tenant_id=tenant_id,
                        account_id=account.id,
                        transaction_type=CreditTransactionType.BOOKING,
                        amount=-booking.credits_used,
                        balance_after=account.balance,
                        description=f"Restauration : séance '{session.title}' réactivée",
                        reference=str(booking.id)
                    )
                    db.add(tx)
                    booking.status = BookingStatus.CONFIRMED
                else:
                    # Pas assez de crédits ou compte non trouvé, on laisse en 'session_cancelled'
                    logger.warning(
                        "Impossible de restaurer l'inscription: crédits insuffisants",
                        user_id=str(booking.user_id),
                        booking_id=str(booking.id)
                    )
            else:
                # Gratuit ou déjà payé autrement ?
                booking.status = BookingStatus.CONFIRMED
    
    await db.commit()
    await db.refresh(session)
    
    return SessionResponse.model_validate(session)


@router.post("/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_sessions(
    request_data: SessionDuplicateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Duplique les séances d'une période source vers une date cible.
    Seules les séances actives sont dupliquées.
    Les inscriptions ne sont pas copiées.
    """
    tenant_id = request.state.tenant_id
    
    # S'assurer que les dates sont naïves pour SQLAlchemy si nécessaire
    source_start = request_data.source_start
    if source_start.tzinfo:
        source_start = source_start.replace(tzinfo=None)
    
    source_end = request_data.source_end
    if source_end.tzinfo:
        source_end = source_end.replace(tzinfo=None)
        
    target_start = request_data.target_start
    if target_start.tzinfo:
        target_start = target_start.replace(tzinfo=None)
        
    # Calculer le décalage temporel
    offset = target_start - source_start
    
    # Récupérer les séances de la période source
    query = select(Session).where(
        and_(
            Session.tenant_id == tenant_id,
            Session.start_time >= source_start,
            Session.start_time <= source_end,
            Session.is_active == True
        )
    )
    result = await db.execute(query)
    source_sessions = result.scalars().all()
    
    count = 0
    for s in source_sessions:
        # Créer une nouvelle séance à partir de l'existante
        new_session = Session(
            tenant_id=tenant_id,
            title=s.title,
            description=s.description,
            instructor_name=s.instructor_name,
            activity_type=s.activity_type,
            max_participants=s.max_participants,
            credits_required=s.credits_required,
            allow_waitlist=s.allow_waitlist,
            start_time=s.start_time + offset,
            end_time=s.end_time + offset,
            is_active=True
        )
        db.add(new_session)
        count += 1
        
    await db.commit()
    
    return {"count": count}
