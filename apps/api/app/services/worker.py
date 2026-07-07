"""
Worker Arq pour l'exécution des tâches de fond asynchrones (e-mails, rappels)
"""
from arq.connections import RedisSettings
from app.core.config import settings
from app.services.tasks import process_reminders, process_google_review_prompts
from app.services.email_service import EmailService
from app.models.models import User, Tenant
import structlog
import asyncio

logger = structlog.get_logger()

async def send_h24_reminder_task(ctx, user_id: str, tenant_id: str, title: str, start_time_str: str, location: str, is_event: bool):
    """Tâche d'envoi de rappel par e-mail"""
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import select
    from datetime import datetime
    
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.id == user_id))
        user = user_res.scalar_one_or_none()
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        
        if not user or not tenant:
            logger.error("User or Tenant not found for reminder task", user_id=user_id, tenant_id=tenant_id)
            return False
            
        start_time = datetime.fromisoformat(start_time_str)
        return await EmailService.send_h24_reminder(
            user=user,
            tenant=tenant,
            title=title,
            start_time=start_time,
            location=location,
            is_event=is_event
        )

async def cron_process_reminders(ctx):
    """Tâche périodique pour scanner et envoyer les rappels H-24"""
    logger.info("⏰ [Worker] Lancement périodique du scan des rappels...")
    await process_reminders()

async def cron_process_google_review_prompts(ctx):
    """Tâche périodique pour scanner et envoyer les invitations d'avis Google"""
    logger.info("⭐ [Worker] Lancement périodique du scan des avis Google...")
    await process_google_review_prompts()

async def startup(ctx):
    logger.info("🚀 Arq Worker démarre...")

async def shutdown(ctx):
    logger.info("🛑 Arq Worker s'arrête...")

# Configuration du Worker
class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
    functions = [send_h24_reminder_task]
    
    # Tâches périodiques (Cron)
    cron_jobs = [
        # Exécuter les scans toutes les 30 minutes
        arq.cron(cron_process_reminders, minute={0, 30}),
        arq.cron(cron_process_google_review_prompts, minute={15, 45}),
    ]

# Import arq ici pour éviter de charger le module si on importe juste le fichier
import arq
