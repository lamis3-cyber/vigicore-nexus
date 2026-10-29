from fastapi import APIRouter, HTTPException
from bot.schemas.bot_schemas import (
    AnalyzeReportRequest, AnalyzeReportResponse,
    SupplierSolutionRequest, SupplierSolutionResponse
)
from bot.services.claude_service import analyze_report_with_claude, generate_supplier_solutions
from bot.services.prediction_service import detect_problem_type
from bot.services.memory_service import AsyncSessionLocal, save_session_context
from sqlalchemy import text
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

# ============================================
# ACTIONS SUGGÉRÉES PAR RÔLE
# ============================================

SUGGESTED_ACTIONS = {
    "ResponsableQualite": [
        {"action": "CREATE_ALERT", "label_fr": "Créer une alerte", "label_en": "Create an alert"},
        {"action": "ASSIGN_TASK", "label_fr": "Assigner une tâche", "label_en": "Assign a task"},
        {"action": "CHANGE_STATUS", "label_fr": "Changer le statut", "label_en": "Change status"},
        {"action": "OPEN_WORKSPACE", "label_fr": "Ouvrir un workspace", "label_en": "Open a workspace"},
    ],
    "Doctor": [
        {"action": "COMPLETE_REPORT", "label_fr": "Compléter le rapport", "label_en": "Complete the report"},
        {"action": "OPEN_WORKSPACE", "label_fr": "Ouvrir un workspace", "label_en": "Open a workspace"},
    ],
    "Technician": [
        {"action": "UPDATE_TASK", "label_fr": "Mettre à jour ma tâche", "label_en": "Update my task"},
        {"action": "ADD_COMMENT", "label_fr": "Ajouter un commentaire", "label_en": "Add a comment"},
    ],
    "SupplierAgent": [
        {"action": "PROPOSE_SOLUTION", "label_fr": "Proposer une solution", "label_en": "Propose a solution"},
        {"action": "INITIATE_RECALL", "label_fr": "Initier un rappel", "label_en": "Initiate a recall"},
    ]
}

@router.post("/report/{reportId}", response_model=AnalyzeReportResponse)
async def analyze_report(reportId: str, request: AnalyzeReportRequest):
    """Analyse complète d'un rapport avec IA"""
    try:
        # 1. Récupérer données du rapport
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT r.id, r.type, r.severity, r.status, r.description,
                           d.model as device_model, p.name as product_name,
                           r."submittedAt", r."updatedAt"
                    FROM reports r
                    LEFT JOIN devices d ON d.id = r."deviceId"
                    LEFT JOIN products p ON p.id = r."productId"
                    WHERE r.id = :reportId
                """),
                {"reportId": reportId}
            )
            report = result.fetchone()

        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        report_data = {
            "id": str(report[0]),
            "type": report[1],
            "severity": report[2],
            "status": report[3],
            "description": report[4],
            "deviceModel": report[5],
            "productName": report[6],
        }

        # 2. Sauvegarder contexte rapport dans session
        await save_session_context(request.userId, {
            "reportId": reportId,
            "reportSeverity": report[2],
            "reportType": report[1]
        })

        # 3. Analyser avec Claude
        claude_result = await analyze_report_with_claude(
            report_data, request.userRole, request.language.value
        )

        # 4. Calculer riskScore basé sur sévérité
        severity_scores = {
            "MINOR": 20.0, "MODERATE": 40.0,
            "HIGH": 65.0, "CRITICAL": 85.0, "FATAL": 100.0
        }
        risk_score = severity_scores.get(report[2], 50.0)

        # 5. Actions suggérées selon rôle
        actions = SUGGESTED_ACTIONS.get(request.userRole, [])
        lang = request.language.value
        formatted_actions = [
            {
                "action": a["action"],
                "label": a[f"label_{lang.lower()}"]
            }
            for a in actions
        ]

        # 6. Recommandations
        recommendations = [claude_result["analysis"]]

        return AnalyzeReportResponse(
            reportId=reportId,
            summary=claude_result["analysis"],
            riskScore=risk_score,
            confidence=claude_result["confidence"],
            recommendations=recommendations,
            suggestedActions=formatted_actions,
            language=request.language
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analyze report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/supplier/{reportId}", response_model=SupplierSolutionResponse)
async def supplier_solutions(reportId: str, request: SupplierSolutionRequest):
    """Proposer des solutions techniques pour le fournisseur"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT r.description, r.severity, r.type, d.model
                    FROM reports r
                    LEFT JOIN devices d ON d.id = r."deviceId"
                    WHERE r.id = :reportId
                """),
                {"reportId": reportId}
            )
            report = result.fetchone()

        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        report_data = {
            "description": report[0],
            "severity": report[1],
            "type": report[2],
            "deviceModel": report[3]
        }

        # Détecter type de problème
        problem_type = detect_problem_type(report[0] or "")

        # Générer solutions avec Claude
        solutions_result = await generate_supplier_solutions(
            report_data, problem_type, request.language.value
        )

        return SupplierSolutionResponse(
            reportId=reportId,
            problemType=problem_type,
            solutions=[{"description": solutions_result["solutions"]}],
            confidence=solutions_result["confidence"],
            language=request.language
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supplier solutions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
