from fastapi import APIRouter, HTTPException
from bot.services.proactive_service import run_all_checks
from bot.services.memory_service import AsyncSessionLocal
from sqlalchemy import text
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/proactive")
async def list_proactive_alerts(userId: str, limit: int = 20):
    """Lister les alertes proactives d'un utilisateur"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT id, type, message, confidence, "isSeen", "sentAt",
                           "deviceId", "reportId"
                    FROM bot_proactive_alerts
                    WHERE "userId" = :userId
                    ORDER BY "sentAt" DESC
                    LIMIT :limit
                """),
                {"userId": userId, "limit": limit}
            )
            rows = result.fetchall()

        alerts = [
            {
                "id": str(row[0]),
                "type": row[1],
                "message": row[2],
                "confidence": row[3],
                "isSeen": row[4],
                "sentAt": str(row[5]),
                "deviceId": str(row[6]) if row[6] else None,
                "reportId": str(row[7]) if row[7] else None
            }
            for row in rows
        ]

        unseen = len([a for a in alerts if not a["isSeen"]])
        return {"total": len(alerts), "unseen": unseen, "alerts": alerts}

    except Exception as e:
        logger.error(f"List alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{alertId}/seen")
async def mark_seen(alertId: str):
    """Marquer une alerte comme vue"""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    UPDATE bot_proactive_alerts
                    SET "isSeen" = true
                    WHERE id = :alertId
                """),
                {"alertId": alertId}
            )
            await session.commit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Mark seen error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check")
async def trigger_check():
    """Déclencher manuellement les vérifications proactives (Admin)"""
    try:
        await run_all_checks()
        return {"success": True, "message": "Vérifications proactives lancées"}
    except Exception as e:
        logger.error(f"Trigger check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def alerts_stats():
    """Statistiques des alertes proactives (Admin)"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT
                        COUNT(*) as total,
                        COUNT(CASE WHEN "isSeen" = true THEN 1 END) as seen,
                        COUNT(CASE WHEN type = 'PANNE_RISK' THEN 1 END) as panne_risk,
                        COUNT(CASE WHEN type = 'REPORT_STALE' THEN 1 END) as report_stale,
                        COUNT(CASE WHEN type = 'EXPIRY_SOON' THEN 1 END) as expiry_soon,
                        COUNT(CASE WHEN type = 'PATTERN_DETECTED' THEN 1 END) as pattern_detected,
                        AVG(confidence) as avg_confidence
                    FROM bot_proactive_alerts
                """)
            )
            row = result.fetchone()

        return {
            "total": row[0],
            "seen": row[1],
            "readRate": round((row[1] / row[0] * 100) if row[0] > 0 else 0, 2),
            "byType": {
                "PANNE_RISK": row[2],
                "REPORT_STALE": row[3],
                "EXPIRY_SOON": row[4],
                "PATTERN_DETECTED": row[5]
            },
            "avgConfidence": round(float(row[6]) if row[6] else 0, 2)
        }
    except Exception as e:
        logger.error(f"Alerts stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
