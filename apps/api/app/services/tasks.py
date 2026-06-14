
import asyncio
import structlog
from datetime import datetime, timedelta
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal
from app.models.models import Booking, EventRegistration, Session, Event, User, Tenant, BookingStatus, EventRegistrationStatus
from app.services.email_service import EmailService

logger = structlog.get_logger()

async def process_reminders():
    """
    Tâche de fond pour envoyer les rappels H-24.
    Scanne les réservations et inscriptions prévues dans environ 24h.
    """
    logger.info("⏰ Scan des rappels H-24 en cours...")
    
    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        # On cible une fenêtre de 24h (+/- 1h pour être sûr de ne rien rater si la tâche tourne toutes les 15-30 min)
        h24_start = now + timedelta(hours=22)
        h24_end = now + timedelta(hours=26)
        
        # 1. Rappels pour les Séances (Bookings)
        booking_query = (
            select(Booking)
            .join(Session)
            .join(User)
            .where(
                and_(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.reminder_sent_at.is_(None),
                    Session.start_time >= h24_start,
                    Session.start_time <= h24_end,
                    User.remind_before_session == True
                )
            )
            .options(joinedload(Booking.session), joinedload(Booking.user).joinedload(User.tenant))
        )
        
        result = await db.execute(booking_query)
        bookings = result.scalars().all()
        
        for b in bookings:
            try:
                logger.info(f"Sending reminder for booking {b.id} to {b.user.email}")
                success = await EmailService.send_h24_reminder(
                    user=b.user,
                    tenant=b.user.tenant,
                    title=b.session.title,
                    start_time=b.session.start_time,
                    location=b.session.location,
                    is_event=False
                )
                if success:
                    b.reminder_sent_at = now
            except Exception as e:
                logger.error("Error sending booking reminder", error=str(e), booking_id=str(b.id))
        
        # 2. Rappels pour les Évènements (EventRegistration)
        tomorrow = (now + timedelta(days=1)).date()
        
        event_query = (
            select(EventRegistration)
            .join(Event)
            .join(User)
            .where(
                and_(
                    EventRegistration.status == EventRegistrationStatus.CONFIRMED,
                    EventRegistration.reminder_sent_at.is_(None),
                    Event.event_date == tomorrow,
                    User.remind_before_session == True
                )
            )
            .options(joinedload(EventRegistration.event), joinedload(EventRegistration.user).joinedload(User.tenant))
        )
        
        result = await db.execute(event_query)
        registrations = result.scalars().all()
        
        for reg in registrations:
            try:
                event_start = datetime.combine(reg.event.event_date, reg.event.event_time)
                # Check if it's in the H24 window
                if h24_start <= event_start <= h24_end:
                    logger.info(f"Sending reminder for event {reg.event.title} to {reg.user.email}")
                    success = await EmailService.send_h24_reminder(
                        user=reg.user,
                        tenant=reg.user.tenant,
                        title=reg.event.title,
                        start_time=event_start,
                        location=reg.event.location,
                        is_event=True
                    )
                    if success:
                        reg.reminder_sent_at = now
            except Exception as e:
                logger.error("Error sending event reminder", error=str(e), reg_id=str(reg.id))
        
        await db.commit()

async def process_google_review_prompts():
    """
    Tâche de fond pour envoyer les demandes d'avis Google.
    Scanne les utilisateurs n'ayant pas reçu l'e-mail et qui ont atteint le seuil de séances complétées.
    """
    logger.info("⭐ Scan des demandes d'avis Google en cours...")
    
    from sqlalchemy import func
    
    async with AsyncSessionLocal() as db:
        # Sélectionner les utilisateurs éligibles (ceux qui n'ont pas encore reçu l'e-mail
        # et dont le club a activé la fonctionnalité avec un lien configuré)
        query = (
            select(User)
            .join(Tenant)
            .where(
                and_(
                    User.review_prompt_sent_at.is_(None),
                    Tenant.enable_review_prompts == True,
                    Tenant.google_review_url.isnot(None),
                    Tenant.google_review_url != ""
                )
            )
            .options(joinedload(User.tenant))
        )
        
        result = await db.execute(query)
        users = result.scalars().all()
        
        for u in users:
            try:
                # Compter les réservations complétées de cet utilisateur
                booking_count_query = (
                    select(func.count(Booking.id))
                    .where(
                        and_(
                            Booking.user_id == u.id,
                            Booking.status == BookingStatus.COMPLETED
                        )
                    )
                )
                count_res = await db.execute(booking_count_query)
                completed_count = count_res.scalar() or 0
                
                # Si le nombre dépasse ou égale le seuil du club, on envoie
                if completed_count >= u.tenant.review_prompt_threshold:
                    logger.info(f"Sending Google Review prompt to {u.email} (Completed: {completed_count}/{u.tenant.review_prompt_threshold})")
                    success = await EmailService.send_google_review_prompt(user=u, tenant=u.tenant)
                    if success:
                        u.review_prompt_sent_at = datetime.utcnow()
            except Exception as e:
                logger.error("Error sending Google Review prompt", error=str(e), user_id=str(u.id))
                
        await db.commit()

async def run_background_tasks():
    """
    Boucle infinie pour les tâches de fond.
    Lancée au démarrage de l'application.
    """
    logger.info("🔄 Background task runner started")
    # Attendre un peu que l'app soit bien lancée
    await asyncio.sleep(10)
    
    while True:
        try:
            await process_reminders()
        except Exception as e:
            logger.error("Background task execution failed for reminders", error=str(e))
        
        try:
            await process_google_review_prompts()
        except Exception as e:
            logger.error("Background task execution failed for google review prompts", error=str(e))
        
        # On tourne toutes les 30 minutes
        await asyncio.sleep(30 * 60)

