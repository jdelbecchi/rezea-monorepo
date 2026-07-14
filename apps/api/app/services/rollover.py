import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import structlog
from app.models.models import Order
from app.core.config import settings
from app.services.period_utils import compute_period_bounds, compute_limit_balance_for_date

logger = structlog.get_logger()

async def process_period_rollovers(ctx):
    """
    Tâche exécutée par le CRON (arq) pour gérer la clôture des périodes de plafonnement
    et générer les reports (rollover) de crédits.
    """
    logger.info("Starting process_period_rollovers")
    
    db_factory = ctx.get('db_factory')
    if not db_factory:
        logger.error("No db_factory in arq context")
        return

    async with db_factory() as db:
        stmt = select(Order).where(
            and_(
                Order.status == 'active',
                Order.limit_rollover == True
            )
        )
        result = await db.execute(stmt)
        orders = result.scalars().all()
        
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        
        for order in orders:
            limit_period = order.limit_period if order.limit_period is not None else order.offer_snap_limit_period
            if not limit_period:
                continue
                
            start_bound, end_bound = compute_period_bounds(order.start_date, yesterday, limit_period)
            
            if end_bound == yesterday:
                logger.info(f"Processing rollover for order {order.id} for period ending {yesterday}")
                res = await compute_limit_balance_for_date(db, order, yesterday)
                if res and res['balance'] > 0:
                    order.accumulated_rollover = float(order.accumulated_rollover or 0) + res['balance']
                    logger.info(f"Added {res['balance']} to rollover for order {order.id}. New total: {order.accumulated_rollover}")
                    
        await db.commit()
                
    logger.info("Finished process_period_rollovers")
