"""Routes planning des séances"""
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from sqlalchemy.orm import selectinload, joinedload
from app.db.session import get_db
from app.models.models import Session, CreditAccount, CreditTransaction, Tenant, User, Booking, BookingStatus, CreditTransactionType
from app.schemas.schemas import SessionResponse, SessionCreate, SessionUpdate, SessionDuplicateRequest, SessionBulkUpdate
from app.services.email_service import EmailService
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
    status_filter: str = Query("active", alias="status"),
    include_deleted: bool = Query(False)
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
    
    if not include_deleted:
        query = query.where(Session.deleted_at.is_(None))
        
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
        select(Session)
        .where(
            and_(
                Session.id == session_id,
                Session.tenant_id == tenant_id
            )
        )
        .options(selectinload(Session.bookings).joinedload(Booking.user))
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    # Mise à jour des champs
    update_dict = update_data.model_dump(exclude_unset=True)
    
    # Sécurité : Bloquer la modification du type d'activité ou des crédits s'il y a déjà des inscriptions
    if ("activity_type" in update_dict and update_dict["activity_type"] != session.activity_type) or \
       ("credits_required" in update_dict and update_dict["credits_required"] != session.credits_required):
        from app.models.models import Booking as ModelBooking
        from sqlalchemy import func
        bookings_count_res = await db.execute(
            select(func.count(ModelBooking.id)).where(
                ModelBooking.session_id == session.id
            )
        )
        if bookings_count_res.scalar() > 0:
            if "credits_required" in update_dict and update_dict["credits_required"] != session.credits_required:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Impossible de modifier les crédits de cette séance car elle comporte déjà des inscriptions."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossible de modifier le type d'activité de cette séance car elle comporte déjà des inscriptions. Veuillez d'abord gérer ces inscriptions."
            )

    if update_dict.get('start_time') and update_dict['start_time'].tzinfo:
        update_dict['start_time'] = update_dict['start_time'].replace(tzinfo=None)
    if update_dict.get('end_time') and update_dict['end_time'].tzinfo:
        update_dict['end_time'] = update_dict['end_time'].replace(tzinfo=None)
        
    # Vérifier s'il y a des changements critiques qui nécessitent d'envoyer un email
    critical_fields = ["start_time", "end_time", "location", "title"]
    has_critical_changes = False
    
    for field, value in update_dict.items():
        if field in critical_fields:
            current_val = getattr(session, field)
            if current_val != value:
                has_critical_changes = True
        setattr(session, field, value)
    
    await db.commit()
    await db.refresh(session)

    # Si la séance a des inscriptions actives et qu'il y a eu des modifications critiques, notifier par email
    if has_critical_changes:
        active_bookings = [
            b for b in session.bookings
            if b.status in [BookingStatus.CONFIRMED, BookingStatus.PENDING] and b.user
        ]
        if active_bookings:
            tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
            tenant = tenant_res.scalar_one_or_none()
            if tenant:
                # Utiliser arq ou envoyer directement (ici l'envoi en tâche de fond est préférable)
                from app.core.redis import get_redis
                try:
                    redis = await get_redis()
                    user_ids = [str(b.user_id) for b in active_bookings]
                    await redis.enqueue_job(
                        "send_bulk_session_modification_task",
                        user_ids,
                        str(tenant_id),
                        str(session.id)
                    )
                except Exception:
                    # Fallback direct si redis n'est pas dispo
                    users = [b.user for b in active_bookings]
                    await EmailService.send_bulk_session_modification(users, tenant, session)
    
    return SessionResponse.model_validate(session)


@router.patch("/bulk-update", response_model=List[SessionResponse])
async def bulk_update_sessions(
    update_data: SessionBulkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Met à jour plusieurs séances à la fois
    """
    tenant_id = request.state.tenant_id
    
    # 1. Charger les séances
    result = await db.execute(
        select(Session)
        .where(
            and_(
                Session.id.in_(update_data.session_ids),
                Session.tenant_id == tenant_id
            )
        )
        .options(selectinload(Session.bookings).joinedload(Booking.user))
    )
    sessions = list(result.scalars().all())
    
    if len(sessions) != len(update_data.session_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certaines séances n'ont pas été trouvées ou ne vous appartiennent pas"
        )
    
    # 2. Vérifier la modification d'activité ou de crédits si des réservations existent
    if update_data.activity_type is not None or update_data.credits_required is not None:
        for session in sessions:
            if (update_data.activity_type is not None and update_data.activity_type != session.activity_type) or \
               (update_data.credits_required is not None and update_data.credits_required != session.credits_required):
                from app.models.models import Booking as ModelBooking
                from sqlalchemy import func
                bookings_res = await db.execute(
                    select(func.count(ModelBooking.id)).where(
                        ModelBooking.session_id == session.id
                    )
                )
                if bookings_res.scalar() > 0:
                    if update_data.credits_required is not None and update_data.credits_required != session.credits_required:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Impossible de modifier les crédits car la séance '{session.title}' a déjà des inscriptions."
                        )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Impossible de modifier le type d'activité car la séance '{session.title}' a déjà des inscriptions."
                    )
                    
    # 3. Préparer les modifications
    update_dict = update_data.model_dump(exclude_unset=True)
    update_dict.pop("session_ids", None)
    
    # Enregistrer les séances modifiées et les utilisateurs à notifier
    modified_sessions = []
    
    for session in sessions:
        has_critical_changes = False
        
        # Gestion des horaires (heure et durée)
        if "time" in update_dict or "duration_minutes" in update_dict:
            # Récupérer l'heure de début actuelle
            current_start = session.start_time
            current_end = session.end_time
            
            # Recalculer l'heure de début
            if "time" in update_dict and update_dict["time"]:
                try:
                    h, m = map(int, update_dict["time"].split(":"))
                    new_start = current_start.replace(hour=h, minute=m, second=0, microsecond=0)
                    if new_start != current_start:
                        session.start_time = new_start
                        has_critical_changes = True
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Format d'heure invalide (doit être HH:MM)"
                    )
            
            # Recalculer l'heure de fin à partir de la durée
            duration = update_dict.get("duration_minutes")
            if duration is not None:
                new_end = session.start_time + timedelta(minutes=duration)
                if new_end != current_end:
                    session.end_time = new_end
                    has_critical_changes = True
            else:
                # Si pas de nouvelle durée mais changement d'heure, conserver la durée initiale
                old_duration_ms = current_end - current_start
                session.end_time = session.start_time + old_duration_ms

        # Appliquer les autres champs
        for field, value in update_dict.items():
            if field in ["time", "duration_minutes"]:
                continue
            
            if field in ["title", "description", "instructor_name", "max_participants", "credits_required", "location", "allow_waitlist", "activity_type"]:
                current_val = getattr(session, field)
                if current_val != value:
                    if field in ["title", "location"]:
                        has_critical_changes = True
                    setattr(session, field, value)
        
        modified_sessions.append((session, has_critical_changes))
        
    await db.commit()
    
    # 4. Envoyer les notifications
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    
    if tenant:
        from app.core.redis import get_redis
        redis = None
        try:
            redis = await get_redis()
        except Exception:
            pass
            
        for session, has_critical_changes in modified_sessions:
            await db.refresh(session)
            if has_critical_changes:
                active_bookings = [
                    b for b in session.bookings
                    if b.status in [BookingStatus.CONFIRMED, BookingStatus.PENDING] and b.user
                ]
                if active_bookings:
                    user_ids = [str(b.user_id) for b in active_bookings]
                    if redis:
                        try:
                            await redis.enqueue_job(
                                "send_bulk_session_modification_task",
                                user_ids,
                                str(tenant_id),
                                str(session.id)
                            )
                            continue
                        except Exception:
                            pass
                    
                    # Fallback direct
                    users = [b.user for b in active_bookings]
                    await EmailService.send_bulk_session_modification(users, tenant, session)
                    
    return [SessionResponse.model_validate(s) for s, _ in modified_sessions]


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
        select(Session)
        .where(
            and_(
                Session.id == session_id,
                Session.tenant_id == tenant_id
            )
        )
        .options(selectinload(Session.bookings))
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Séance non trouvée"
        )
    
    # Empêcher la suppression des séances passées sauf si elles n'ont pas d'inscriptions actives
    has_active_bookings = any(
        booking.status not in [BookingStatus.CANCELLED, BookingStatus.SESSION_CANCELLED]
        for booking in session.bookings
    )
    if session.start_time < datetime.utcnow() and has_active_bookings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de supprimer une séance passée contenant des inscriptions"
        )
    
    # Soft delete
    session.is_active = False
    session.deleted_at = datetime.utcnow()
    
    # Gérer les inscriptions (Remboursement des crédits si applicable)
    for booking in session.bookings:
        if booking.status in [BookingStatus.CONFIRMED, BookingStatus.PENDING]:
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
                if account:
                    account.balance += booking.credits_used
                    account.total_used -= booking.credits_used
                    
                    tx = CreditTransaction(
                        tenant_id=tenant_id,
                        account_id=account.id,
                        transaction_type=CreditTransactionType.REFUND,
                        amount=booking.credits_used,
                        balance_after=account.balance,
                        description=f"Remboursement : séance '{session.title}' supprimée",
                        reference=str(booking.id)
                    )
                    db.add(tx)
            
            booking.status = BookingStatus.SESSION_CANCELLED
            
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
        .options(selectinload(Session.bookings).joinedload(Booking.user))
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
    failed_restorations = []
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
                    # Pas assez de crédits ou compte non trouvé, on laisse en 'session_cancelled' et on l'ajoute à la liste des échecs
                    failed_restorations.append({
                        "user_id": str(booking.user_id),
                        "first_name": booking.user.first_name if booking.user else "Utilisateur",
                        "last_name": booking.user.last_name if booking.user else "Inconnu"
                    })
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
    
    response = SessionResponse.model_validate(session)
    response.failed_restorations = failed_restorations
    return response


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
