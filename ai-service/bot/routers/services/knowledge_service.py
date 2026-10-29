import json
import os
from typing import Optional, List
from sqlalchemy import text
from bot.services.memory_service import AsyncSessionLocal
from utils.logger import get_logger

logger = get_logger(__name__)

async def search_knowledge(query: str, userRole: str, language: str) -> Optional[dict]:
    """Rechercher dans la base de connaissances"""
    try:
        async with AsyncSessionLocal() as session:
            lang_col = "question_fr" if language == "FR" else "question_en"
            ans_col = "answer_fr" if language == "FR" else "answer_en"

            result = await session.execute(
                text(f"""
                    SELECT id, category, {lang_col}, {ans_col}, role::text
                    FROM bot_knowledge_base
                    WHERE "isActive" = true
                    AND (role::text = 'ALL' OR role::text = :role)
                    AND (
                        LOWER({lang_col}) LIKE LOWER(:query)
                        OR LOWER({ans_col}) LIKE LOWER(:query)
                        OR LOWER(category) LIKE LOWER(:query)
                    )
                    ORDER BY
                        CASE WHEN role::text = :role THEN 0 ELSE 1 END,
                        CASE WHEN LOWER({lang_col}) LIKE LOWER(:exact) THEN 0 ELSE 1 END
                    LIMIT 1
                """),
                {
                    "role": userRole,
                    "query": f"%{query}%",
                    "exact": f"%{query}%"
                }
            )
            row = result.fetchone()
            if row:
                return {
                    "id": str(row[0]),
                    "category": row[1],
                    "question": row[2],
                    "answer": row[3],
                    "role": row[4],
                    "confidence": 0.90
                }
            return None
    except Exception as e:
        logger.error(f"Knowledge search error: {e}")
        return None

async def import_knowledge_from_file(filepath: str) -> dict:
    """Importer la base de connaissances depuis un fichier JSON"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        inserted = 0
        skipped = 0

        async with AsyncSessionLocal() as session:
            for item in data:
                result = await session.execute(
                    text("SELECT id FROM bot_knowledge_base WHERE question_fr = :question_fr"),
                    {"question_fr": item.get("question_fr", "")}
                )
                if result.fetchone():
                    skipped += 1
                    continue

                await session.execute(
                    text("""
                        INSERT INTO bot_knowledge_base
                        (id, category, question_fr, answer_fr, question_en, answer_en, role, "isActive", "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), :category, :question_fr, :answer_fr, :question_en, :answer_en, :role, true, now(), now())
                    """),
                    {
                        "category": item.get("category", "GENERAL"),
                        "question_fr": item.get("question_fr", ""),
                        "answer_fr": item.get("answer_fr", ""),
                        "question_en": item.get("question_en", ""),
                        "answer_en": item.get("answer_en", ""),
                        "role": item.get("role", "ALL")
                    }
                )
                inserted += 1

            await session.commit()

        logger.info(f"Knowledge import: {inserted} inserted, {skipped} skipped")
        return {"inserted": inserted, "skipped": skipped, "total": len(data)}

    except Exception as e:
        logger.error(f"Knowledge import error: {e}")
        raise

async def create_knowledge(data: dict) -> str:
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    INSERT INTO bot_knowledge_base
                    (id, category, question_fr, answer_fr, question_en, answer_en, role, "isActive", "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), :category, :question_fr, :answer_fr, :question_en, :answer_en, :role, true, now(), now())
                    RETURNING id
                """),
                data
            )
            await session.commit()
            return str(result.scalar())
    except Exception as e:
        logger.error(f"Knowledge create error: {e}")
        raise

async def update_knowledge(id: str, data: dict) -> bool:
    try:
        async with AsyncSessionLocal() as session:
            set_clauses = ", ".join([f'"{k}" = :{k}' for k in data.keys()])
            data["id"] = id
            await session.execute(
                text(f'UPDATE bot_knowledge_base SET {set_clauses}, "updatedAt" = now() WHERE id = :id'),
                data
            )
            await session.commit()
            return True
    except Exception as e:
        logger.error(f"Knowledge update error: {e}")
        return False

async def list_knowledge(role: Optional[str] = None, language: str = "FR") -> List[dict]:
    try:
        async with AsyncSessionLocal() as session:
            query = """
                SELECT id, category, question_fr, answer_fr, question_en, answer_en, role::text, "isActive"
                FROM bot_knowledge_base WHERE 1=1
            """
            params = {}
            if role:
                query += " AND (role::text = 'ALL' OR role::text = :role)"
                params["role"] = role
            query += ' ORDER BY category, "createdAt"'
            result = await session.execute(text(query), params)
            rows = result.fetchall()
            return [
                {
                    "id": str(row[0]),
                    "category": row[1],
                    "question_fr": row[2],
                    "answer_fr": row[3],
                    "question_en": row[4],
                    "answer_en": row[5],
                    "role": row[6],
                    "isActive": row[7]
                }
                for row in rows
            ]
    except Exception as e:
        logger.error(f"Knowledge list error: {e}")
        return []
