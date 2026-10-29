import redis.asyncio as redis
import json
import os
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# REDIS CONNECTION
# ============================================

redis_client: Optional[redis.Redis] = None

async def get_redis() -> redis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            encoding="utf-8",
            decode_responses=True
        )
    return redis_client

# ============================================
# POSTGRESQL CONNECTION
# ============================================

engine = create_async_engine(
    os.getenv("DATABASE_URL", "postgresql+asyncpg://materio_user:materio_password@localhost:5432/materiovigilance"),
    echo=False
)

AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ============================================
# SESSION MEMORY (Redis)
# ============================================

async def save_session_message(userId: str, role: str, content: str, confidence: Optional[float] = None):
    """Sauvegarder un message dans la session Redis"""
    try:
        r = await get_redis()
        key = f"bot:session:{userId}"
        session = await r.get(key)
        messages = json.loads(session) if session else []
        messages.append({
            "role": role,
            "content": content,
            "confidence": confidence,
            "timestamp": datetime.utcnow().isoformat()
        })
        # Garder seulement les 20 derniers messages
        if len(messages) > 20:
            messages = messages[-20:]
        await r.set(key, json.dumps(messages), ex=3600)
        logger.info(f"Session message saved for user {userId}")
    except Exception as e:
        logger.error(f"Redis save error: {e}")

async def get_session_messages(userId: str) -> List[dict]:
    """Récupérer les messages de la session courante"""
    try:
        r = await get_redis()
        key = f"bot:session:{userId}"
        session = await r.get(key)
        return json.loads(session) if session else []
    except Exception as e:
        logger.error(f"Redis get error: {e}")
        return []

async def save_session_context(userId: str, context: dict):
    """Sauvegarder le contexte actif (rapport en cours, device...)"""
    try:
        r = await get_redis()
        key = f"bot:context:{userId}"
        await r.set(key, json.dumps(context), ex=3600)
        logger.info(f"Context saved for user {userId}")
    except Exception as e:
        logger.error(f"Redis context save error: {e}")

async def get_session_context(userId: str) -> dict:
    """Récupérer le contexte actif"""
    try:
        r = await get_redis()
        key = f"bot:context:{userId}"
        context = await r.get(key)
        return json.loads(context) if context else {}
    except Exception as e:
        logger.error(f"Redis context get error: {e}")
        return {}

async def clear_session(userId: str):
    """Effacer la session Redis"""
    try:
        r = await get_redis()
        await r.delete(f"bot:session:{userId}")
        await r.delete(f"bot:context:{userId}")
        logger.info(f"Session cleared for user {userId}")
    except Exception as e:
        logger.error(f"Redis clear error: {e}")

# ============================================
# PERSISTENT MEMORY (PostgreSQL)
# ============================================

async def create_conversation(userId: str, language: str) -> str:
    """Créer une nouvelle conversation en base"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    INSERT INTO bot_conversations (id, "userId", language, "isActive", "startedAt", "lastActivityAt")
                    VALUES (gen_random_uuid(), :userId, :language, true, now(), now())
                    RETURNING id
                """),
                {"userId": userId, "language": language}
            )
            await session.commit()
            conversationId = str(result.scalar())
            logger.info(f"Conversation created: {conversationId}")
            return conversationId
    except Exception as e:
        logger.error(f"DB create conversation error: {e}")
        raise

async def save_message_db(conversationId: str, sender: str, content: str, confidence: Optional[float] = None, sources: Optional[list] = None):
    """Sauvegarder un message en base PostgreSQL"""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO bot_messages (id, "conversationId", sender, content, confidence, sources, "createdAt")
                    VALUES (gen_random_uuid(), :conversationId, :sender, :content, :confidence, :sources, now())
                """),
                {
                    "conversationId": conversationId,
                    "sender": sender,
                    "content": content,
                    "confidence": confidence,
                    "sources": json.dumps(sources) if sources else None
                }
            )
            await session.execute(
                text("""UPDATE bot_conversations SET "lastActivityAt" = now() WHERE id = :id"""),
                {"id": conversationId}
            )
            await session.commit()
    except Exception as e:
        logger.error(f"DB save message error: {e}")
        raise

async def get_conversation_history(userId: str, limit: int = 20) -> List[dict]:
    """Récupérer l'historique des conversations depuis PostgreSQL"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT m.sender, m.content, m.confidence, m."createdAt"
                    FROM bot_messages m
                    JOIN bot_conversations c ON c.id = m."conversationId"
                    WHERE c."userId" = :userId
                    ORDER BY m."createdAt" DESC
                    LIMIT :limit
                """),
                {"userId": userId, "limit": limit}
            )
            rows = result.fetchall()
            return [
                {
                    "sender": row[0],
                    "content": row[1],
                    "confidence": row[2],
                    "createdAt": str(row[3])
                }
                for row in reversed(rows)
            ]
    except Exception as e:
        logger.error(f"DB get history error: {e}")
        return []

async def get_or_create_conversation(userId: str, conversationId: Optional[str], language: str) -> str:
    """Récupérer ou créer une conversation"""
    if conversationId:
        return conversationId
    # Chercher conversation active existante
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT id FROM bot_conversations
                    WHERE "userId" = :userId AND "isActive" = true
                    ORDER BY "lastActivityAt" DESC
                    LIMIT 1
                """),
                {"userId": userId}
            )
            row = result.fetchone()
            if row:
                return str(row[0])
    except Exception as e:
        logger.error(f"DB get conversation error: {e}")
    return await create_conversation(userId, language)
