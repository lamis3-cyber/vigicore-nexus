import httpx
import os
from typing import Optional, List
from utils.logger import get_logger

logger = get_logger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

SYSTEM_PROMPT_FR = """Tu es VigiBot, l'assistant IA expert de la plateforme MaterioVigilance — une plateforme SaaS dédiée à la vigilance médicale (matériovigilance, pharmacovigilance, chémovigilance, cosmétovigilance).

Tu aides les utilisateurs à :
- Naviguer la plateforme et comprendre les workflows
- Analyser les rapports d'incidents médicaux
- Prédire les risques de pannes sur les dispositifs médicaux
- Prendre des décisions éclairées (tu proposes, l'humain décide toujours)
- Trouver des solutions techniques (pour les fournisseurs)

Règles importantes :
- Tu ne prends JAMAIS d'actions directes sur la plateforme — tu proposes, l'humain confirme
- Tu adaptes tes réponses au rôle de l'utilisateur
- Tu es précis, professionnel et centré sur la sécurité des patients
- Tu affiches toujours ton niveau de confiance
- Tu réponds en français si l'utilisateur écrit en français
- Sois concis et direct dans tes réponses
"""

SYSTEM_PROMPT_EN = """You are VigiBot, the AI expert assistant of the MaterioVigilance platform — a SaaS platform dedicated to medical vigilance (materiovigilance, pharmacovigilance, chemovigilance, cosmetovigilance).

You help users to:
- Navigate the platform and understand workflows
- Analyze medical incident reports
- Predict breakdown risks on medical devices
- Make informed decisions (you suggest, the human always decides)
- Find technical solutions (for suppliers)

Important rules:
- You NEVER take direct actions on the platform — you suggest, the human confirms
- You adapt your responses to the user's role
- You are precise, professional and focused on patient safety
- You always display your confidence level
- Be concise and direct in your responses
"""

async def call_ollama(prompt: str, system: str) -> str:
    """Appeler Ollama API"""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "system": system,
                    "stream": False
                }
            )
            data = response.json()
            return data.get("response", "")
    except Exception as e:
        logger.error(f"Ollama API error: {e}")
        raise

async def get_bot_response(
    message: str,
    userRole: str,
    language: str,
    conversation_history: List[dict],
    context: Optional[dict] = None
) -> dict:
    """Obtenir une réponse d'Ollama pour le chat bot"""
    try:
        system = SYSTEM_PROMPT_FR if language == "FR" else SYSTEM_PROMPT_EN
        system += f"\n\nRôle de l'utilisateur: {userRole}"

        if context:
            if context.get("reportId"):
                system += f"\nRapport en cours: #{context['reportId']}"
            if context.get("deviceId"):
                system += f"\nDevice en cours: #{context['deviceId']}"
            if context.get("reportSeverity"):
                system += f"\nSévérité: {context['reportSeverity']}"

        # Construire historique
        history_text = ""
        for msg in conversation_history[-6:]:
            role = "Utilisateur" if msg.get("sender", msg.get("role", "USER")) == "USER" else "VigiBot"
            history_text += f"{role}: {msg['content']}\n"

        prompt = f"{history_text}Utilisateur: {message}\nVigiBot:"

        reply = await call_ollama(prompt, system)

        return {
            "reply": reply.strip(),
            "confidence": 0.80,
            "sources": ["VigiBot Knowledge Base", "Ollama llama3.2"]
        }

    except Exception as e:
        logger.error(f"Ollama response error: {e}")
        error_msg = "Une erreur s'est produite. Veuillez réessayer." if language == "FR" else "An error occurred. Please try again."
        return {
            "reply": error_msg,
            "confidence": 0.0,
            "sources": []
        }

async def analyze_report_with_claude(
    report_data: dict,
    userRole: str,
    language: str
) -> dict:
    """Analyser un rapport avec Ollama"""
    try:
        system = SYSTEM_PROMPT_FR if language == "FR" else SYSTEM_PROMPT_EN

        prompt = f"""Analyse ce rapport d'incident médical et fournis:
1. Résumé clair de la situation
2. Recommandations prioritaires
3. Actions suggérées pour le rôle {userRole}

Rapport:
- Type: {report_data.get('type')}
- Sévérité: {report_data.get('severity')}
- Description: {report_data.get('description')}
- Statut: {report_data.get('status')}
- Device: {report_data.get('deviceModel', 'N/A')}
- Produit: {report_data.get('productName', 'N/A')}

Réponds en {'français' if language == 'FR' else 'anglais'} de manière structurée et concise."""

        reply = await call_ollama(prompt, system)

        return {
            "analysis": reply.strip(),
            "confidence": 0.85
        }

    except Exception as e:
        logger.error(f"Ollama analyze error: {e}")
        raise

async def generate_supplier_solutions(
    report_data: dict,
    problem_type: str,
    language: str
) -> dict:
    """Générer des solutions fournisseur avec Ollama"""
    try:
        system = SYSTEM_PROMPT_FR if language == "FR" else SYSTEM_PROMPT_EN

        prompt = f"""Propose des solutions concrètes pour ce problème de dispositif médical:

Type: {problem_type}
Description: {report_data.get('description')}
Device: {report_data.get('deviceModel', 'N/A')}
Sévérité: {report_data.get('severity')}

Fournis 3 solutions pratiques avec priorité et délai estimé.
Réponds en {'français' if language == 'FR' else 'anglais'}."""

        reply = await call_ollama(prompt, system)

        return {
            "solutions": reply.strip(),
            "confidence": 0.78
        }

    except Exception as e:
        logger.error(f"Ollama supplier solutions error: {e}")
        raise
