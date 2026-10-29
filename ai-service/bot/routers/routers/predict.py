from fastapi import APIRouter, HTTPException
from bot.schemas.bot_schemas import PredictDeviceRequest, PredictDeviceResponse, BotModelType
from bot.services.prediction_service import predict_device_failure, predict_all_devices
from bot.models.ml_model import save_model_version, get_active_model
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.post("/device/{deviceId}", response_model=PredictDeviceResponse)
async def predict_device(deviceId: str, request: PredictDeviceRequest):
    """Prédire le risque de panne pour un device spécifique"""
    try:
        result = await predict_device_failure(deviceId, request.language.value)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return PredictDeviceResponse(
            deviceId=deviceId,
            riskLevel=result["riskLevel"],
            riskScore=result["riskScore"],
            confidence=result["confidence"],
            reasons=result["reasons"],
            recommendations=result["recommendations"],
            modelType=BotModelType.RULES,
            language=request.language
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Predict device error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/devices")
async def predict_all(orgId: str, language: str = "FR"):
    """Prédire les risques pour tous les devices d'une organisation"""
    try:
        predictions = await predict_all_devices(orgId, language)
        return {
            "total": len(predictions),
            "highRisk": len([p for p in predictions if p["riskLevel"] in ["HIGH", "CRITICAL"]]),
            "predictions": predictions
        }
    except Exception as e:
        logger.error(f"Predict all error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/model/stats")
async def model_stats():
    """Récupérer les statistiques du modèle actif"""
    try:
        model = await get_active_model()
        if not model:
            return {
                "version": "v1.0_rules",
                "type": "RULES",
                "accuracy": None,
                "trainedAt": None,
                "isActive": True,
                "message": "Modèle basé sur règles métier — Phase 1"
            }
        return model
    except Exception as e:
        logger.error(f"Model stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train")
async def train_model(orgId: str = None):
    """Lancer l'entraînement du modèle ML (Admin uniquement)"""
    try:
        from bot.services.memory_service import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM reports WHERE \"deviceId\" IS NOT NULL")
            )
            total_reports = result.scalar()

        if total_reports < 50:
            return {
                "success": False,
                "message": f"Données insuffisantes: {total_reports}/50 rapports minimum requis",
                "modelType": "RULES",
                "recommendation": "Continuer avec les règles métier jusqu'à accumulation de données"
            }

        # Sauvegarder version règles actuelle
        version = await save_model_version(
            "RULES",
            None,
            {"total_reports": total_reports, "phase": 1}
        )

        return {
            "success": True,
            "version": version,
            "modelType": "RULES",
            "totalReports": total_reports,
            "message": "Modèle règles métier activé — ML disponible après 50+ rapports"
        }

    except Exception as e:
        logger.error(f"Train model error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train/ml")
async def train_ml_model():
    """Entraîner le modèle ML sur CSV + rapports réels"""
    try:
        from bot.models.train_model import train, import_devices_to_db
        import asyncio

        # Importer les machines d'abord
        import_result = await import_devices_to_db()

        # Entraîner le modèle
        train_result = await train()

        return {
            "success": True,
            "import": import_result,
            "training": train_result,
            "message": f"Modèle ML entraîné avec {train_result['total_samples']} échantillons — Précision: {train_result['accuracy']:.2%}"
        }
    except Exception as e:
        logger.error(f"Train ML error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict/ml")
async def predict_ml(description: str, device_model: str = ""):
    """Prédire le type de problème avec le modèle ML"""
    try:
        from bot.models.train_model import predict_with_ml
        result = predict_with_ml(description, device_model)
        if not result:
            return {"error": "Modèle ML non encore entraîné", "fallback": "RULES"}
        return result
    except Exception as e:
        logger.error(f"ML predict error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
