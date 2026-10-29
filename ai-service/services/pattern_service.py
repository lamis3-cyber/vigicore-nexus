from collections import Counter
from datetime import datetime, timedelta
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# DETECT PATTERNS
# ============================================
def detect_patterns(reports: list) -> dict:
    try:
        if not reports:
            return {"patterns": [], "signals": []}

        patterns = []
        signals = []

        # Pattern 1 — Même type d'incident fréquent
        type_counts = Counter(r.get("type") for r in reports)
        for report_type, count in type_counts.items():
            if count >= 3:
                patterns.append({
                    "pattern": f"High frequency of {report_type} incidents",
                    "frequency": count,
                    "type": "FREQUENCY",
                    "riskLevel": "HIGH" if count >= 5 else "MEDIUM",
                })

        # Pattern 2 — Même dispositif impliqué
        device_counts = Counter(
            r.get("deviceId") for r in reports if r.get("deviceId")
        )
        for device_id, count in device_counts.items():
            if count >= 2:
                patterns.append({
                    "pattern": f"Device {device_id} involved in multiple incidents",
                    "frequency": count,
                    "type": "DEVICE_RECURRENCE",
                    "riskLevel": "CRITICAL" if count >= 4 else "HIGH",
                })

        # Pattern 3 — Même département
        dept_counts = Counter(
            r.get("departmentId") for r in reports if r.get("departmentId")
        )
        for dept_id, count in dept_counts.items():
            if count >= 3:
                patterns.append({
                    "pattern": f"Department {dept_id} has recurring incidents",
                    "frequency": count,
                    "type": "DEPARTMENT_CLUSTER",
                    "riskLevel": "HIGH",
                })

        # Pattern 4 — Sévérité élevée en cluster temporel
        critical_reports = [
            r for r in reports
            if r.get("severity") in ["CRITICAL", "FATAL"]
        ]
        if len(critical_reports) >= 2:
            patterns.append({
                "pattern": f"{len(critical_reports)} critical/fatal incidents detected",
                "frequency": len(critical_reports),
                "type": "SEVERITY_CLUSTER",
                "riskLevel": "CRITICAL",
            })

        # Pattern 5 — Même produit impliqué
        product_counts = Counter(
            r.get("productId") for r in reports if r.get("productId")
        )
        for product_id, count in product_counts.items():
            if count >= 2:
                patterns.append({
                    "pattern": f"Product {product_id} involved in multiple incidents",
                    "frequency": count,
                    "type": "PRODUCT_RECURRENCE",
                    "riskLevel": "CRITICAL" if count >= 3 else "HIGH",
                })

        # Générer des signaux à partir des patterns critiques
        for pattern in patterns:
            if pattern["riskLevel"] in ["CRITICAL", "HIGH"]:
                signals.append({
                    "pattern": pattern["pattern"],
                    "frequency": pattern["frequency"],
                    "riskLevel": pattern["riskLevel"],
                    "firstDetectedAt": datetime.utcnow().isoformat(),
                    "lastDetectedAt": datetime.utcnow().isoformat(),
                    "requiresAlert": pattern["riskLevel"] == "CRITICAL",
                })

        logger.info(
            f"Pattern detection complete: {len(patterns)} patterns, "
            f"{len(signals)} signals"
        )

        return {
            "patterns": patterns,
            "signals": signals,
            "summary": {
                "totalPatterns": len(patterns),
                "totalSignals": len(signals),
                "criticalPatterns": sum(
                    1 for p in patterns if p["riskLevel"] == "CRITICAL"
                ),
                "highPatterns": sum(
                    1 for p in patterns if p["riskLevel"] == "HIGH"
                ),
            },
        }

    except Exception as e:
        logger.error(f"Error detecting patterns: {e}")
        raise

# ============================================
# RECALL RECOMMENDATION
# ============================================
def recommend_recall(reports: list, product_id: str) -> dict:
    try:
        product_reports = [
            r for r in reports if r.get("productId") == product_id
        ]

        if not product_reports:
            return {
                "recommendRecall": False,
                "reason": "No reports found for this product",
                "confidence": 0.0,
            }

        total = len(product_reports)
        critical_count = sum(
            1 for r in product_reports
            if r.get("severity") in ["CRITICAL", "FATAL"]
        )
        high_count = sum(
            1 for r in product_reports
            if r.get("severity") == "HIGH"
        )

        # Score de recommandation
        recall_score = (
            (critical_count * 0.5) +
            (high_count * 0.3) +
            (total * 0.1)
        )

        recommend = recall_score >= 2.0
        confidence = min(recall_score / 5.0, 0.95)

        reason = (
            f"Found {total} reports for this product, "
            f"including {critical_count} critical and {high_count} high severity incidents."
        )

        logger.info(
            f"Recall recommendation for product {product_id}: "
            f"recommend={recommend}, score={recall_score}"
        )

        return {
            "recommendRecall": recommend,
            "recallScore": round(recall_score, 2),
            "confidence": round(confidence, 2),
            "reason": reason,
            "breakdown": {
                "totalReports": total,
                "criticalReports": critical_count,
                "highReports": high_count,
            },
        }

    except Exception as e:
        logger.error(f"Error recommending recall: {e}")
        raise