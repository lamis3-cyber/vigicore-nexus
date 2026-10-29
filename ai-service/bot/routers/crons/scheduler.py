from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from bot.services.proactive_service import run_all_checks
from utils.logger import get_logger
import os
import time

logger = get_logger(__name__)
scheduler = AsyncIOScheduler()

async def retrain_model_if_needed():
    """Ré-entraîner le modèle si nouveaux rapports disponibles"""
    try:
        from bot.services.memory_service import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM reports WHERE \"deviceId\" IS NOT NULL")
            )
            total = result.scalar()

        MODEL_PATH = os.path.join(
            os.path.dirname(__file__), "../models/vigibot_ml_model.pkl"
        )

        should_retrain = False
        if os.path.exists(MODEL_PATH):
            model_age = (time.time() - os.path.getmtime(MODEL_PATH)) / 3600
            if model_age > 24:
                should_retrain = True
        else:
            should_retrain = True

        if should_retrain and total >= 5:
            from bot.models.train_model import train
            await train()
            logger.info(f"✅ Model retrained automatically with {total} reports")
        else:
            logger.info(f"⏭ Retrain skipped — {total} reports, model up to date")

    except Exception as e:
        logger.error(f"Auto retrain error: {e}")

def start_scheduler():
    """Démarrer le scheduler"""
    scheduler.add_job(
        run_all_checks,
        trigger=IntervalTrigger(hours=1),
        id="proactive_checks",
        name="VigiBot Proactive Checks",
        replace_existing=True
    )
    scheduler.add_job(
        retrain_model_if_needed,
        trigger=IntervalTrigger(hours=24),
        id="auto_retrain",
        name="VigiBot Auto Retrain",
        replace_existing=True
    )
    scheduler.start()
    logger.info("✅ VigiBot scheduler started — checks every 1h, retrain every 24h")

def stop_scheduler():
    """Arrêter le scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("🛑 VigiBot scheduler stopped")
