"""
API admin pour la gestion des inscriptions aux séances
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.models import (
    User, UserRole, Booking, Session, BookingStatus,
    CreditAccount, CreditTransaction, CreditTransactionType,
    Order, OrderPaymentStatus,
)
from app.schemas.schemas import (
    AdminBookingCreate, AdminBookingUpdate, AdminBookingResponse,
)
from app.api.bookings import auto_restitute_expired_waitlist

router = APIRouter()


# ---- Auth dependency ----
async def require_manager(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Vérifie que l'utilisateur connecté est owner ou manager"""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.OWNER, UserRole.MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux managers",
        )
    return user


def build_booking_response(booking: Booking, users_with_pending: set = None) -> AdminBookingResponse:
    """Construit la réponse avec les champs joints"""
    session = booking.session
    user = booking.user
    
    has_pending = False
    if users_with_pending is not None:
        has_pending = booking.user_id in users_with_pending

    return AdminBookingResponse(
        id=booking.id,
        tenant_id=booking.tenant_id,
        user_id=booking.user_id,
        session_id=booking.session_id,
        status=booking.status,
        credits_used=booking.credits_used,
        created_by_admin=booking.created_by_admin or False,
        cancellation_type=booking.cancellation_type,
        notes=booking.notes,
        created_at=booking.created_at,
        cancelled_at=booking.cancelled_at,
        session_date=session.start_time.strftime("%Y-%m-%d") if session else "",
        session_time=session.start_time.strftime("%H:%M") if session else "",
        session_title=session.title if session else "",
        user_name=f"{user.first_name} {user.last_name}" if user else "",
        user_phone=user.phone if user else None,
        instagram_handle=user.instagram_handle if user else None,
        facebook_handle=user.facebook_handle if user else None,
        has_pending_order=has_pending
    )


async def auto_promote_waitlist(db: AsyncSession, tenant_id, session_id):
    """
    Promeut automatiquement le 1er inscrit en attente vers confirmé
    quand une place se libère.
    """
    # Trouver le 1er en attente (par date de création = FIFO)
    result = await db.execute(
        select(Booking)
        .where(
            Booking.tenant_id == tenant_id,
            Booking.session_id == session_id,
            Booking.status == BookingStatus.PENDING,
        )
        .order_by(Booking.created_at.asc())
        .limit(1)
    )
    next_booking = result.scalar_one_or_none()

    if not next_booking:
        return None

    # Statut promu
    next_booking.status = BookingStatus.CONFIRMED

    # Récupérer la séance pour incrémenter le compteur
    sess_result = await db.execute(
        select(Session).where(Session.id == session_id).with_for_update()
    )
    session = sess_result.scalar_one_or_none()
    if session:
        session.current_participants += 1
        session.waitlist_count = max(0, session.waitlist_count - 1)

    return next_booking


# ---- SESSIONS LIST (for create form dropdown) ----
@router.get("/sessions")
async def list_sessions_for_bookings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Liste les séances actives pour le formulaire d'inscription"""
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Session)
        .where(Session.tenant_id == tenant_id, Session.is_active == True)
        .order_by(Session.start_time.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "start_time": s.start_time.isoformat(),
            "max_participants": s.max_participants,
            "current_participants": s.current_participants,
        }
        for s in sessions
    ]


# ---- LIST ----
@router.get("", response_model=List[AdminBookingResponse])
async def list_bookings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
    status_filter: Optional[str] = Query(None, alias="status"),
    session_id: Optional[str] = Query(None, alias="session_id"),
):
    tenant_id = request.state.tenant_id
    
    # Restitution automatique des crédits pour les listes d'attente expirées de tout le tenant
    await auto_restitute_expired_waitlist(db, tenant_id)
    
    query = (
        select(Booking)
        .where(Booking.tenant_id == tenant_id)
        .options(joinedload(Booking.session), joinedload(Booking.user))
        .order_by(Booking.created_at.desc())
    )

    # Filtre par statut
    if status_filter == "confirmed":
        query = query.where(Booking.status == BookingStatus.CONFIRMED)
    elif status_filter == "pending":
        query = query.where(Booking.status == BookingStatus.PENDING)
    elif status_filter == "cancelled":
        query = query.where(Booking.status == BookingStatus.CANCELLED)
    elif status_filter == "session_cancelled":
        query = query.where(Booking.status == BookingStatus.SESSION_CANCELLED)
    elif status_filter == "absent":
        query = query.where(Booking.status == BookingStatus.ABSENT)
    # Filtre par séance
    if session_id:
        query = query.where(Booking.session_id == session_id)

    # Filtre par statut

    result = await db.execute(query)
    bookings = result.unique().scalars().all()

    # Bulk check pending orders for these users
    user_ids = {b.user_id for b in bookings}
    users_with_pending = set()
    if user_ids:
        pending_orders_result = await db.execute(
            select(Order.user_id).where(
                Order.tenant_id == tenant_id,
                Order.user_id.in_(user_ids),
                Order.payment_status.in_([
                    OrderPaymentStatus.PENDING, 
                    OrderPaymentStatus.WAITING,
                    OrderPaymentStatus.ISSUE
                ])
            )
        )
        users_with_pending = set(pending_orders_result.scalars().all())

    return [build_booking_response(b, users_with_pending) for b in bookings]


# ---- CREATE ----
@router.post("", response_model=AdminBookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    request: Request,
    data: AdminBookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id

    # Vérifier que l'utilisateur existe
    user_result = await db.execute(
        select(User).where(User.id == data.user_id, User.tenant_id == tenant_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Vérifier que la séance existe
    session_result = await db.execute(
        select(Session)
        .where(
            Session.id == data.session_id,
            Session.tenant_id == tenant_id,
            Session.is_active == True,
        )
        .with_for_update()
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Séance non trouvée")

    # Vérifier si l'utilisateur n'est pas déjà inscrit
    existing = await db.execute(
        select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.user_id == data.user_id,
            Booking.session_id == data.session_id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cet utilisateur est déjà inscrit à cette séance",
        )

    # Déterminer le statut : confirmé si place dispo, en attente sinon
    if session.current_participants < session.max_participants:
        booking_status = BookingStatus.CONFIRMED
        session.current_participants += 1
    else:
        booking_status = BookingStatus.PENDING
        session.waitlist_count += 1

    # Gérer les crédits (immédiatement, même pour la liste d'attente)
    transaction_id = None
    credits_used = session.credits_required
    if credits_used > 0:
        acct = await db.execute(
            select(CreditAccount).where(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == data.user_id,
            )
        )
        account = acct.scalar_one_or_none()

        if account:
            # Débit systématique (permet le négatif pour le manager)
            account.balance -= credits_used
            account.total_used += credits_used
            tx = CreditTransaction(
                tenant_id=tenant_id,
                account_id=account.id,
                transaction_type=CreditTransactionType.BOOKING,
                amount=-credits_used,
                balance_after=account.balance,
                description=f"Réservation de séance ({booking_status.value})",
                consumed_at=datetime.utcnow(),
            )
            db.add(tx)
            await db.flush()
            transaction_id = tx.id
        else:
            # Si pas de compte crédit, on ne peut pas débiter (cas rare)
            credits_used = 0

    booking = Booking(
        tenant_id=tenant_id,
        user_id=data.user_id,
        session_id=data.session_id,
        status=booking_status,
        credits_used=credits_used,
        transaction_id=transaction_id,
        notes=data.notes,
        created_by_admin=True,
    )
    db.add(booking)
    await db.commit()

    # Reload avec relations
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(joinedload(Booking.session), joinedload(Booking.user))
    )
    booking = result.unique().scalar_one()
    return build_booking_response(booking)


# ---- UPDATE ----
@router.patch("/{booking_id}", response_model=AdminBookingResponse)
async def update_booking(
    booking_id: str,
    request: Request,
    data: AdminBookingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id, Booking.tenant_id == tenant_id)
        .options(joinedload(Booking.session), joinedload(Booking.user))
    )
    booking = result.unique().scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    update_data = data.model_dump(exclude_unset=True)

    # Gestion du changement de statut (Réversibilité totale)
    if "status" in update_data:
        old_status = booking.status
        try:
            new_status = BookingStatus(update_data["status"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Statut invalide: {update_data['status']}")

        if new_status != old_status:
            # Liste des statuts qui occupent une place
            active_statuses = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.ABSENT]
            # Note: ABSENT est considéré comme ayant occupé une place (la séance est passée ou réservée)
            
            was_active = old_status in active_statuses
            is_active = new_status in active_statuses
            
            # 1. Libération de place (Actif -> Inactif)
            # Inactifs : CANCELLED, PENDING (liste d'attente), SESSION_CANCELLED
            if was_active and new_status in (BookingStatus.CANCELLED, BookingStatus.SESSION_CANCELLED, BookingStatus.PENDING):
                if booking.session:
                    booking.session.current_participants = max(0, booking.session.current_participants - 1)
                
                if old_status == BookingStatus.PENDING and booking.session:
                    booking.session.waitlist_count = max(0, booking.session.waitlist_count - 1)
                
                # Rembourser les crédits si l'annulation est valide
                if booking.credits_used > 0:
                    acct = await db.execute(
                        select(CreditAccount).where(
                            CreditAccount.tenant_id == tenant_id,
                            CreditAccount.user_id == booking.user_id,
                        )
                    )
                    account = acct.scalar_one_or_none()
                    if account:
                        account.balance += booking.credits_used
                        account.total_used -= booking.credits_used
                        refund = CreditTransaction(
                            tenant_id=tenant_id,
                            account_id=account.id,
                            transaction_type=CreditTransactionType.REFUND,
                            amount=booking.credits_used,
                            balance_after=account.balance,
                            description=f"Remboursement: Statut passé de {old_status} à {new_status}",
                            reference=str(booking.id),
                        )
                        db.add(refund)
                        booking.credits_used = 0
                        booking.transaction_id = None

                # Si c'était une annulation par l'utilisateur
                if new_status == BookingStatus.CANCELLED:
                    booking.cancelled_at = datetime.utcnow()
                    booking.cancellation_type = "user"

                # Promotion automatique si place libérée
                if old_status in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED):
                    await auto_promote_waitlist(db, tenant_id, booking.session_id)

            # 2. Occupation de place (Inactif -> Actif)
            elif not was_active and is_active:
                if booking.session:
                    booking.session.current_participants += 1
                
                if old_status == BookingStatus.PENDING and booking.session:
                    booking.session.waitlist_count = max(0, booking.session.waitlist_count - 1)
                
                booking.cancelled_at = None
                booking.cancellation_type = None

                # Débiter les crédits SEULEMENT si ils n'ont pas déjà été débités (cas d'une reprise après annulation)
                credits_to_deduct = booking.session.credits_required if booking.session else 0
                if credits_to_deduct > 0 and (booking.credits_used == 0 or booking.transaction_id is None):
                    acct = await db.execute(
                        select(CreditAccount).where(
                            CreditAccount.tenant_id == tenant_id,
                            CreditAccount.user_id == booking.user_id,
                        )
                    )
                    account = acct.scalar_one_or_none()
                    if account:
                        # On permet le débit même si balance < credits (flexibilité manager)
                        account.balance -= credits_to_deduct
                        account.total_used += credits_to_deduct
                        tx = CreditTransaction(
                            tenant_id=tenant_id,
                            account_id=account.id,
                            transaction_type=CreditTransactionType.BOOKING,
                            amount=-credits_to_deduct,
                            balance_after=account.balance,
                            description=f"Débit: Statut passé de {old_status} à {new_status}",
                            consumed_at=datetime.utcnow(),
                            reference=str(booking.id)
                        )
                        db.add(tx)
                        await db.flush()
                        booking.transaction_id = tx.id
                        booking.credits_used = credits_to_deduct

            booking.status = new_status

    for field, value in update_data.items():
        setattr(booking, field, value)

    await db.commit()

    # Reload
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(joinedload(Booking.session), joinedload(Booking.user))
    )
    booking = result.unique().scalar_one()
    return build_booking_response(booking)


# ---- DELETE ----
@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking(
    booking_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    tenant_id = request.state.tenant_id
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id, Booking.tenant_id == tenant_id)
        .options(joinedload(Booking.session))
    )
    booking = result.unique().scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    session_id = booking.session_id

    # Décrémenter le compteur si confirmé
    if booking.status == BookingStatus.CONFIRMED and booking.session:
        booking.session.current_participants = max(
            0, booking.session.current_participants - 1
        )
    if booking.status == BookingStatus.PENDING and booking.session:
        booking.session.waitlist_count = max(
            0, booking.session.waitlist_count - 1
        )

    # Rembourser les crédits si applicable
    if booking.credits_used > 0 and booking.status in (
        BookingStatus.CONFIRMED, BookingStatus.PENDING
    ):
        acct = await db.execute(
            select(CreditAccount).where(
                CreditAccount.tenant_id == tenant_id,
                CreditAccount.user_id == booking.user_id,
            )
        )
        account = acct.scalar_one_or_none()
        if account:
            account.balance += booking.credits_used
            account.total_used -= booking.credits_used
            refund = CreditTransaction(
                tenant_id=tenant_id,
                account_id=account.id,
                transaction_type=CreditTransactionType.REFUND,
                amount=booking.credits_used,
                balance_after=account.balance,
                description="Remboursement inscription supprimée (admin)",
                reference=str(booking.id),
            )
            db.add(refund)

    await db.delete(booking)
    await db.flush()

    # Promouvoir le prochain si place libérée
    if booking.status == BookingStatus.CONFIRMED:
        await auto_promote_waitlist(db, tenant_id, session_id)

    await db.commit()
