import numpy as np
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# SEVERITY WEIGHTS
# ============================================
SEVERITY_WEIGHTS = {
    "MINOR": 0.1,
    "MODERATE": 0.3,
    "HIGH": 0.6,
    "CRITICAL": 0.85,
    "FATAL": 1.0,
}

TYPE_WEIGHTS = {
    "MATERIO": 0.7,
    "PHARMACO": 0.8,
    "CHIMICO": 0.75,
    "DEVICE": 0.65,
    "VACCINE_REACTION": 0.9,
    "BIOLOGICAL_INCIDENT": 0.85,
    "OVERDOSE": 0.95,
}

PATIENT_IMPACT_WEIGHTS = {
    "No patient harm": 0.0,
    "Minor temporary harm": 0.2,
    "Moderate harm": 0.5,
    "Severe harm": 0.8,
    "Death": 1.0,
}

# ============================================
# SCORE REPORT
# ============================================
def score_report(report_data: dict) -> dict:
    try:
        severity = report_data.get("severity", "MINOR")
        report_type = report_data.get("type", "MATERIO")
        patient_age = report_data.get("patientAge")
        description = report_data.get("description", "")
        is_anonymous = report_data.get("isAnonymous", False)

        # Score de base selon sévérité
        severity_score = SEVERITY_WEIGHTS.get(severity, 0.1)

        # Score selon le type d'incident
        type_score = TYPE_WEIGHTS.get(report_type, 0.5)

        # Facteur âge (vulnérabilité)
        age_factor = 0.0
        if patient_age is not None:
            if patient_age < 5 or patient_age > 75:
                age_factor = 0.2
            elif patient_age < 15 or patient_age > 65:
                age_factor = 0.1

        # Facteur longueur description (plus de détails = plus sérieux)
        desc_factor = min(len(description) / 500, 0.1)

        # Calcul du score final (0-100)
        raw_score = (
            severity_score * 0.5 +
            type_score * 0.3 +
            age_factor * 0.15 +
            desc_factor * 0.05
        )

        final_score = round(min(raw_score * 100, 100), 2)

        # Déterminer le niveau de risque
        if final_score >= 80:
            risk_level = "CRITICAL"
        elif final_score >= 60:
            risk_level = "HIGH"
        elif final_score >= 35:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Confiance du modèle
        confidence = round(0.75 + (desc_factor * 2), 2)
        confidence = min(confidence, 0.95)

        result = {
            "riskScore": final_score,
            "riskLevel": risk_level,
            "confidence": confidence,
            "breakdown": {
                "severityScore": round(severity_score * 50, 2),
                "typeScore": round(type_score * 30, 2),
                "ageFactor": round(age_factor * 15, 2),
                "descriptionFactor": round(desc_factor * 5, 2),
            },
            "recommendation": _get_recommendation(risk_level),
        }

        logger.info(f"Report scored: riskScore={final_score}, riskLevel={risk_level}")
        return result

    except Exception as e:
        logger.error(f"Error scoring report: {e}")
        raise

# ============================================
# GET RECOMMENDATION
# ============================================
def _get_recommendation(risk_level: str) -> str:
    recommendations = {
        "CRITICAL": "Immediate action required. Create an alert and assign a task urgently.",
        "HIGH": "High priority. Review report immediately and consider creating an alert.",
        "MEDIUM": "Monitor closely. Schedule a review within 24 hours.",
        "LOW": "Standard follow-up. Review within the normal workflow.",
    }
    return recommendations.get(risk_level, "Review required.")

# ============================================
# PREDICT RISK FROM MULTIPLE REPORTS
# ============================================
def predict_risk_trend(reports: list) -> dict:
    try:
        if not reports:
            return {"trend": "NO_DATA", "riskScore": 0}

        scores = []
        for report in reports:
            scored = score_report(report)
            scores.append(scored["riskScore"])

        avg_score = np.mean(scores)
        max_score = np.max(scores)
        trend_score = (avg_score * 0.4) + (max_score * 0.6)

        if trend_score >= 80:
            trend = "CRITICAL"
        elif trend_score >= 60:
            trend = "HIGH"
        elif trend_score >= 35:
            trend = "MEDIUM"
        else:
            trend = "LOW"

        return {
            "trend": trend,
            "averageScore": round(float(avg_score), 2),
            "maxScore": round(float(max_score), 2),
            "trendScore": round(float(trend_score), 2),
            "totalReports": len(reports),
        }

    except Exception as e:
        logger.error(f"Error predicting risk trend: {e}")
        raise