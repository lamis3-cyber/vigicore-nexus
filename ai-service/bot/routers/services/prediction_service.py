from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import text
from bot.services.memory_service import AsyncSessionLocal
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# RÈGLES MÉTIER (Phase 1)
# ============================================

RISK_RULES = {
    "INCIDENT_FREQUENCY": {
        "threshold": 3,
        "days": 30,
        "risk": "HIGH",
        "weight": 0.35
    },
    "CRITICAL_SEVERITY": {
        "threshold": 2,
        "risk": "CRITICAL",
        "weight": 0.30
    },
    "MAINTENANCE_OVERDUE": {
        "threshold_months": 6,
        "risk": "MODERATE",
        "weight": 0.20
    },
    "DEVICE_AGE": {
        "threshold_years": 10,
        "risk": "MODERATE",
        "weight": 0.15
    }
}

PROBLEM_TYPES = {
    "HUMAN_ERROR": [
        "manipulation", "câble", "cable", "inversé", "inverse",
        "réactif", "reactif", "mauvais", "erreur", "error", "wrong"
    ],
    "HARDWARE_FAILURE": [
        "composant", "component", "usure", "wear", "surchauffe",
        "overheat", "défectueux", "defective", "panne", "failure"
    ],
    "SOFTWARE_ISSUE": [
        "firmware", "logiciel", "software", "calibration",
        "calibrage", "mise à jour", "update", "version"
    ],
    "CONSUMABLE_ISSUE": [
        "réactif", "reactif", "lot", "batch", "expiré", "expired",
        "stockage", "storage", "consommable", "consumable"
    ],
    "ENVIRONMENTAL": [
        "température", "temperature", "humidité", "humidity",
        "vibration", "environnement", "environment", "conditions"
    ]
}

# ============================================
# DÉTECTION TYPE DE PROBLÈME
# ============================================

def detect_problem_type(description: str) -> str:
    """Détecter le type de problème depuis la description"""
    description_lower = description.lower()
    scores = {}
    for problem_type, keywords in PROBLEM_TYPES.items():
        score = sum(1 for kw in keywords if kw in description_lower)
        scores[problem_type] = score
    best_match = max(scores, key=scores.get)
    return best_match if scores[best_match] > 0 else "UNKNOWN"

# ============================================
# PRÉDICTION DE PANNES
# ============================================

async def predict_device_failure(deviceId: str, language: str) -> dict:
    """Prédire le risque de panne pour un device"""
    try:
        async with AsyncSessionLocal() as session:
            # Récupérer infos device
            device_result = await session.execute(
                text("""
                    SELECT id, model, manufacturer, status,
                           "purchaseDate", "lastMaintenanceDate"
                    FROM devices WHERE id = :deviceId
                """),
                {"deviceId": deviceId}
            )
            device = device_result.fetchone()
            if not device:
                return {"error": "Device not found"}

            # Récupérer incidents des 30 derniers jours
            incidents_result = await session.execute(
                text("""
                    SELECT id, severity, description, "submittedAt"
                    FROM reports
                    WHERE "deviceId" = :deviceId
                    AND "submittedAt" >= :since
                    ORDER BY "submittedAt" DESC
                """),
                {
                    "deviceId": deviceId,
                    "since": datetime.utcnow() - timedelta(days=30)
                }
            )
            recent_incidents = incidents_result.fetchall()

            # Récupérer tous les incidents CRITICAL/FATAL
            critical_result = await session.execute(
                text("""
                    SELECT COUNT(*) FROM reports
                    WHERE "deviceId" = :deviceId
                    AND severity IN ('CRITICAL', 'FATAL')
                """),
                {"deviceId": deviceId}
            )
            critical_count = critical_result.scalar()

        # ============================================
        # APPLICATION DES RÈGLES MÉTIER
        # ============================================

        risk_score = 0.0
        reasons = []
        recommendations_fr = []
        recommendations_en = []

        # Règle 1 — Fréquence incidents
        incident_count = len(recent_incidents)
        if incident_count >= RISK_RULES["INCIDENT_FREQUENCY"]["threshold"]:
            risk_score += RISK_RULES["INCIDENT_FREQUENCY"]["weight"] * 100
            reasons.append(f"{incident_count} incidents en 30 jours" if language == "FR" else f"{incident_count} incidents in 30 days")
            recommendations_fr.append("Inspection immédiate du device recommandée")
            recommendations_en.append("Immediate device inspection recommended")

        # Règle 2 — Sévérité critique
        if critical_count >= RISK_RULES["CRITICAL_SEVERITY"]["threshold"]:
            risk_score += RISK_RULES["CRITICAL_SEVERITY"]["weight"] * 100
            reasons.append(f"{critical_count} incidents CRITICAL/FATAL détectés" if language == "FR" else f"{critical_count} CRITICAL/FATAL incidents detected")
            recommendations_fr.append("Mise hors service temporaire recommandée")
            recommendations_en.append("Temporary decommissioning recommended")

        # Règle 3 — Maintenance en retard
        if device[5]:
            months_since_maintenance = (datetime.utcnow() - device[5]).days / 30
            if months_since_maintenance > RISK_RULES["MAINTENANCE_OVERDUE"]["threshold_months"]:
                risk_score += RISK_RULES["MAINTENANCE_OVERDUE"]["weight"] * 100
                reasons.append(f"Dernière maintenance il y a {int(months_since_maintenance)} mois" if language == "FR" else f"Last maintenance {int(months_since_maintenance)} months ago")
                recommendations_fr.append("Maintenance préventive urgente requise")
                recommendations_en.append("Urgent preventive maintenance required")

        # Règle 4 — Âge du device
        if device[4]:
            years_old = (datetime.utcnow() - device[4]).days / 365
            if years_old > RISK_RULES["DEVICE_AGE"]["threshold_years"]:
                risk_score += RISK_RULES["DEVICE_AGE"]["weight"] * 100
                reasons.append(f"Device âgé de {int(years_old)} ans" if language == "FR" else f"Device is {int(years_old)} years old")
                recommendations_fr.append("Évaluation de remplacement recommandée")
                recommendations_en.append("Replacement evaluation recommended")

        # Détecter types de problèmes
        problem_types = set()
        for incident in recent_incidents:
            pt = detect_problem_type(incident[2] or "")
            if pt != "UNKNOWN":
                problem_types.add(pt)

        # Recommandations par type de problème
        for pt in problem_types:
            if pt == "HUMAN_ERROR":
                recommendations_fr.append("Formation du personnel recommandée")
                recommendations_en.append("Staff training recommended")
            elif pt == "HARDWARE_FAILURE":
                recommendations_fr.append("Vérification des composants physiques requise")
                recommendations_en.append("Physical component check required")
            elif pt == "SOFTWARE_ISSUE":
                recommendations_fr.append("Mise à jour firmware/recalibration nécessaire")
                recommendations_en.append("Firmware update/recalibration needed")
            elif pt == "CONSUMABLE_ISSUE":
                recommendations_fr.append("Vérification des lots de consommables")
                recommendations_en.append("Consumable batch verification needed")
            elif pt == "ENVIRONMENTAL":
                recommendations_fr.append("Vérification des conditions environnementales")
                recommendations_en.append("Environmental conditions check needed")

        # Calcul niveau de risque
        risk_score = min(risk_score, 100.0)
        if risk_score >= 75:
            risk_level = "CRITICAL"
        elif risk_score >= 50:
            risk_level = "HIGH"
        elif risk_score >= 25:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        confidence = 0.75 if incident_count > 0 else 0.50

        return {
            "deviceId": deviceId,
            "deviceModel": device[1],
            "manufacturer": device[2],
            "riskLevel": risk_level,
            "riskScore": round(risk_score, 2),
            "confidence": confidence,
            "reasons": reasons if reasons else (["Aucun risque détecté"] if language == "FR" else ["No risk detected"]),
            "recommendations": recommendations_fr if language == "FR" else recommendations_en,
            "modelType": "RULES",
            "incidentCount": incident_count,
            "problemTypes": list(problem_types)
        }

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise

async def predict_all_devices(orgId: str, language: str) -> List[dict]:
    """Prédire les risques pour tous les devices d'une organisation"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT id FROM devices
                    WHERE "orgId" = :orgId
                    AND status = 'ACTIVE'
                """),
                {"orgId": orgId}
            )
            device_ids = [str(row[0]) for row in result.fetchall()]

        predictions = []
        for deviceId in device_ids:
            pred = await predict_device_failure(deviceId, language)
            if "error" not in pred:
                predictions.append(pred)

        # Trier par riskScore décroissant
        predictions.sort(key=lambda x: x["riskScore"], reverse=True)
        return predictions

    except Exception as e:
        logger.error(f"Predict all devices error: {e}")
        return []
