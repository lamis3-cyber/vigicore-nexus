from fastapi import APIRouter, HTTPException
from bot.schemas.bot_schemas import (
    KnowledgeSearchRequest, KnowledgeSearchResponse,
    KnowledgeCreateRequest, KnowledgeUpdateRequest
)
from bot.services.knowledge_service import (
    search_knowledge, create_knowledge,
    update_knowledge, list_knowledge,
    import_knowledge_from_file
)
from utils.logger import get_logger
import os

logger = get_logger(__name__)
router = APIRouter()

@router.post("/search", response_model=KnowledgeSearchResponse)
async def search(request: KnowledgeSearchRequest):
    """Rechercher dans la base de connaissances"""
    try:
        result = await search_knowledge(
            request.query,
            request.userRole,
            request.language.value
        )
        if not result:
            not_found = "Aucune réponse trouvée" if request.language.value == "FR" else "No answer found"
            return KnowledgeSearchResponse(
                answer=not_found,
                confidence=0.0,
                category="UNKNOWN",
                language=request.language
            )
        return KnowledgeSearchResponse(
            answer=result["answer"],
            confidence=result["confidence"],
            category=result["category"],
            language=request.language
        )
    except Exception as e:
        logger.error(f"Knowledge search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
async def list_all(role: str = None, language: str = "FR"):
    """Lister toutes les Q&R (Admin)"""
    try:
        items = await list_knowledge(role, language)
        return {"total": len(items), "items": items}
    except Exception as e:
        logger.error(f"Knowledge list error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create(request: KnowledgeCreateRequest):
    """Ajouter une Q&R (Admin)"""
    try:
        id = await create_knowledge(request.model_dump())
        return {"success": True, "id": id}
    except Exception as e:
        logger.error(f"Knowledge create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{id}")
async def update(id: str, request: KnowledgeUpdateRequest):
    """Modifier une Q&R (Admin)"""
    try:
        data = {k: v for k, v in request.model_dump().items() if v is not None}
        success = await update_knowledge(id, data)
        return {"success": success}
    except Exception as e:
        logger.error(f"Knowledge update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import")
async def import_knowledge(filepath: str = None):
    """Importer depuis fichier JSON"""
    try:
        path = filepath or os.path.join(
            os.path.dirname(__file__), "../data/knowledge_base.json"
        )
        result = await import_knowledge_from_file(path)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Knowledge import error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
