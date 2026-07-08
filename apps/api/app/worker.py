import asyncio
from arq import Worker
from arq.connections import RedisSettings
import structlog
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings

logger = structlog.get_logger()

# Import the background tasks
from app.services.email_service import EmailService

async def startup(ctx):
    logger.info("Worker started")
    # Initialize DB engine for the worker
    engine = create_async_engine(settings.DATABASE_URL, echo=settings.DB_ECHO)
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    ctx['db_factory'] = async_session_factory
    ctx['engine'] = engine

async def shutdown(ctx):
    logger.info("Worker shutting down")
    engine = ctx['engine']
    await engine.dispose()

def parse_redis_url(url: str) -> RedisSettings:
    """Parse REDIS_URL into RedisSettings for arq"""
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or 'localhost',
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip('/')) if parsed.path and parsed.path != '/' else 0,
        password=parsed.password
    )

class WorkerSettings:
    functions = [
        EmailService.send_session_promotion_task,
        EmailService.send_order_receipt_task,
        EmailService.send_event_registration_task,
        EmailService.send_bulk_event_cancellation_task,
        EmailService.send_bulk_event_modification_task,
        EmailService.send_event_promotion_task,
    ]
    
    redis_settings = parse_redis_url(settings.REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
    job_timeout = 300 # 5 minutes timeout
