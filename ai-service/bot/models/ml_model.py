import os
import json
from datetime import datetime
from typing import Optional
from sqlalchemy import text
from bot.services.memory_service import AsyncSessionLocal
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# SAUVEGARDE MODÈLE EN BASE
# ============================================

async def save_model_version(model_type: str, accuracy: Optional[float], parameters: dict):
    """Sauvegarder une version du modèle en base"""
    try:
        async with AsyncSessionLocal() as session:
            # Désactiver l'ancien modèle actif
            await session.execute(
                text('UPDATE bot_ml_models SET "isActive" = false WHERE "isActive" = true')
            )
            # Créer nouvelle version
            version = datetime.utcnow().strftime("v%Y%m%d_%H%M%S")
            await session.execute(
                text("""
                    INSERT INTO bot_ml_models
                    (id, version, type, accuracy, "trainedAt", "isActive", parameters, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), :version, :type, :accuracy, now(), true, :parameters, now(), now())
                """),
                {
                    "version": version,
                    "type": model_type,
                    "accuracy": accuracy,
                    "parameters": json.dumps(parameters)
                }
            )
            await session.commit()
            logger.info(f"Model version {version} saved")
            return version
    except Exception as e:
        logger.error(f"Save model error: {e}")
        raise

async def get_active_model() -> Optional[dict]:
    """Récupérer le modèle actif"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT id, version, type, accuracy, "trainedAt", parameters
                    FROM bot_ml_models
                    WHERE "isActive" = true
                    LIMIT 1
                """)
            )
            row = result.fetchone()
            if row:
                return {
                    "id": str(row[0]),
                    "version": row[1],
                    "type": row[2],
                    "accuracy": row[3],
                    "trainedAt": str(row[4]) if row[4] else None,
                    "parameters": json.loads(row[5]) if row[5] else {}
                }
            return None
    except Exception as e:
        logger.error(f"Get active model error: {e}")
        return None
