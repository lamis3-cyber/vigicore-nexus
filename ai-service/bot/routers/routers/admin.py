from fastapi import APIRouter, HTTPException
from bot.services.memory_service import AsyncSessionLocal
from bot.models.ml_model import get_active_model
from sqlalchemy import text
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/stats")
async def global_stats():
    """Statistiques globales du bot (Admin)"""
    try:
        async with AsyncSessionLocal() as session:
            # Total messages
            msg_result = await session.execute(
                text("SELECT COUNT(*) FROM bot_messages")
            )
            total_messages = msg_result.scalar()

            # Messages par sender
            sender_result = await session.execute(
                text("""
                    SELECT sender, COUNT(*)
                    FROM bot_messages
                    GROUP BY sender
                """)
            )
            by_sender = {row[0]: row[1] for row in sender_result.fetchall()}

            # Confiance moyenne
            conf_result = await session.execute(
                text("""
                    SELECT AVG(confidence)
                    FROM bot_messages
                    WHERE sender = 'BOT' AND confidence IS NOT NULL
                """)
            )
            avg_confidence = conf_result.scalar()

            # Total conversations
            conv_result = await session.execute(
                text("SELECT COUNT(*) FROM bot_conversations")
            )
            total_conversations = conv_result.scalar()

            # Conversations actives
            active_result = await session.execute(
                text('SELECT COUNT(*) FROM bot_conversations WHERE "isActive" = true')
            )
            active_conversations = active_result.scalar()

            # Total alertes proactives
            alert_result = await session.execute(
                text("SELECT COUNT(*) FROM bot_proactive_alerts")
            )
            total_alerts = alert_result.scalar()

            # Total Q&R base de connaissances
            kb_result = await session.execute(
                text('SELECT COUNT(*) FROM bot_knowledge_base WHERE "isActive" = true')
            )
            total_knowledge = kb_result.scalar()

        return {
            "messages": {
                "total": total_messages,
                "bySender": by_sender,
                "avgConfidence": round(float(avg_confidence) if avg_confidence else 0, 2)
            },
            "conversations": {
                "total": total_conversations,
                "active": active_conversations
            },
            "proactiveAlerts": {
                "total": total_alerts
            },
            "knowledgeBase": {
                "totalActive": total_knowledge
            }
        }

    except Exception as e:
        logger.error(f"Global stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/conversations")
async def list_conversations(limit: int = 50, userId: str = None):
    """Historique conversations (Admin)"""
    try:
        async with AsyncSessionLocal() as session:
            query = """
                SELECT c.id, c."userId", u.name, c.language,
                       c."startedAt", c."lastActivityAt", c."isActive",
                       COUNT(m.id) as message_count
                FROM bot_conversations c
                JOIN users u ON u.id = c."userId"
                LEFT JOIN bot_messages m ON m."conversationId" = c.id
                WHERE 1=1
            """
            params = {"limit": limit}
            if userId:
                query += ' AND c."userId" = :userId'
                params["userId"] = userId
            query += ' GROUP BY c.id, u.name ORDER BY c."lastActivityAt" DESC LIMIT :limit'

            result = await session.execute(text(query), params)
            rows = result.fetchall()

        conversations = [
            {
                "id": str(row[0]),
                "userId": str(row[1]),
                "userName": row[2],
                "language": row[3],
                "startedAt": str(row[4]),
                "lastActivityAt": str(row[5]),
                "isActive": row[6],
                "messageCount": row[7]
            }
            for row in rows
        ]

        return {"total": len(conversations), "conversations": conversations}

    except Exception as e:
        logger.error(f"List conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/performance")
async def ml_performance():
    """Performance du modèle ML (Admin)"""
    try:
        model = await get_active_model()

        async with AsyncSessionLocal() as session:
            # Stats prédictions
            pred_result = await session.execute(
                text("""
                    SELECT
                        COUNT(*) as total,
                        COUNT(CASE WHEN type = 'PANNE_RISK' THEN 1 END) as panne_predictions,
                        AVG(confidence) as avg_confidence
                    FROM bot_proactive_alerts
                    WHERE type = 'PANNE_RISK'
                """)
            )
            row = pred_result.fetchone()

        return {
            "activeModel": model or {
                "version": "v1.0_rules",
                "type": "RULES",
                "accuracy": None,
                "message": "Phase 1 — Règles métier"
            },
            "predictions": {
                "total": row[0],
                "pannePredictions": row[1],
                "avgConfidence": round(float(row[2]) if row[2] else 0, 2)
            },
            "nextPhase": {
                "requiredReports": 50,
                "message": "Le modèle ML sera disponible après 50 rapports avec deviceId"
            }
        }

    except Exception as e:
        logger.error(f"ML performance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
