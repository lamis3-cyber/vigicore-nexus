from fastapi import APIRouter, HTTPException
from bot.schemas.bot_schemas import ChatMessageRequest, ChatMessageResponse
from bot.services.memory_service import (
    get_session_messages, save_session_message,
    save_message_db, get_or_create_conversation,
    save_session_context, get_session_context
)
from bot.services.knowledge_service import search_knowledge
from bot.services.claude_service import get_bot_response
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.post("/", response_model=ChatMessageResponse)
async def chat(request: ChatMessageRequest):
    """Point d'entrée principal du chat bot"""
    try:
        # 1. Récupérer ou créer conversation
        conversationId = await get_or_create_conversation(
            request.userId,
            request.conversationId,
            request.language.value
        )

        # 2. Récupérer contexte session (Redis)
        context = await get_session_context(request.userId)
        if request.context:
            context.update(request.context)
            await save_session_context(request.userId, context)

        # 3. Sauvegarder message utilisateur
        await save_session_message(request.userId, "USER", request.message)
        await save_message_db(conversationId, "USER", request.message)

        # 4. Chercher dans la base de connaissances d'abord
        knowledge_result = await search_knowledge(
            request.message,
            request.userRole,
            request.language.value
        )

        if knowledge_result and knowledge_result["confidence"] >= 0.85:
            # Réponse depuis la base de connaissances
            reply = knowledge_result["answer"]
            confidence = knowledge_result["confidence"]
            sources = ["VigiBot Knowledge Base"]
            suggested_actions = None
        else:
            # Réponse via Ollama avec fallback
            try:
                session_messages = await get_session_messages(request.userId)
                claude_response = await get_bot_response(
                    message=request.message,
                    userRole=request.userRole,
                    language=request.language.value,
                    conversation_history=session_messages,
                    context=context
                )
                reply = claude_response["reply"]
                confidence = claude_response["confidence"]
                if not reply or confidence == 0.0:
                    raise Exception("Empty response")
            except Exception:
                # Fallback intelligent
                if request.language.value == "FR":
                    reply = (
                        "Je n'ai pas trouvé de réponse précise à votre question. "
                        "Voici ce que je vous suggère :\n\n"
                        "1. Consultez la documentation via le menu Aide\n"
                        "2. Contactez votre Responsable Qualité\n"
                        "3. Créez un rapport via '+ Nouveau rapport'\n\n"
                        "Reformulez votre question et je ferai de mon mieux pour vous aider."
                    )
                else:
                    reply = (
                        "I could not find a precise answer to your question. "
                        "Here are my suggestions:\n\n"
                        "1. Check the documentation via the Help menu\n"
                        "2. Contact your Quality Manager\n"
                        "3. Create a report via '+ New report'\n\n"
                        "Please rephrase your question and I will do my best to help."
                    )
                confidence = 0.5
            sources = claude_response["sources"]
            suggested_actions = None

        # 5. Sauvegarder réponse bot
        await save_session_message(request.userId, "BOT", reply, confidence)
        await save_message_db(conversationId, "BOT", reply, confidence, sources)

        return ChatMessageResponse(
            reply=reply,
            confidence=confidence,
            sources=sources,
            conversationId=conversationId,
            suggestedActions=suggested_actions,
            language=request.language
        )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{userId}")
async def get_history(userId: str, limit: int = 20):
    """Récupérer l'historique des conversations"""
    try:
        from bot.services.memory_service import get_conversation_history
        history = await get_conversation_history(userId, limit)
        return {"userId": userId, "history": history, "total": len(history)}
    except Exception as e:
        logger.error(f"History error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/session/{userId}")
async def clear_session(userId: str):
    """Effacer la session courante"""
    try:
        from bot.services.memory_service import clear_session
        await clear_session(userId)
        return {"success": True, "message": "Session cleared"}
    except Exception as e:
        logger.error(f"Clear session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
