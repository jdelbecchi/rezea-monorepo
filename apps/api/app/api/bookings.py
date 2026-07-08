"""Routes réservations avec gestion FIFO des crédits"""
from typing import List
from fastapi import APIRouter, Depends, Request, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from uuid import UUID
import structlog

from app.db.session import get_db
from app.models.models import Booking, Session, BookingStatus, Tenant
from app.schemas.schemas import BookingCreate, BookingResponse, BookingListResponse
from app.services.booking_service import BookingService
from app.core.rate_limit import limiter

logger = structlog.get_logger()
router = APIRouter()

@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def create_booking(
    booking_data: BookingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Crée une réservation via le BookingService."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    return await BookingService.create_booking(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=booking_data.session_id,
        notes=booking_data.notes
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Annule une réservation et rembourse les crédits via BookingService."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    
    redis_pool = getattr(request.app.state, 'redis', None)
    await BookingService.cancel_booking(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        booking_id=booking_id,
        background_tasks=background_tasks,
        redis_pool=redis_pool
    )
    return None

@router.post("/cron/cleanup-waitlist")
async def cleanup_expired_waitlists(
    db: AsyncSession = Depends(get_db)
):
    """Tâche planifiée pour restituer les crédits des listes d'attente expirées."""
    result = await db.execute(select(Tenant.id))
    tenant_ids = result.scalars().all()
    
    total_processed = 0
    for tenant_id in tenant_ids:
        processed = await BookingService.auto_restitute_expired_waitlist(db, tenant_id)
        total_processed += processed
        
    return {"status": "success", "processed_bookings_count": total_processed}
