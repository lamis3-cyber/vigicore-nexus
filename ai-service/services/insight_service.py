import anthropic
import os
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# CLAUDE API CLIENT
# ============================================
def get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=api_key)

# ============================================
# GENERATE INSIGHT FOR A REPORT
# ============================================
def generate_report_insight(report_data: dict, risk_score: float) -> dict:
    try:
        client = get_client()

        prompt = f"""You are a medical device vigilance expert. Analyze the following incident report and provide a structured insight.

Report Data:
- Type: {report_data.get('type')}
- Severity: {report_data.get('severity')}
- Description: {report_data.get('description')}
- Location: {report_data.get('location', 'Not specified')}
- Patient Age: {report_data.get('patientAge', 'Not specified')}
- Patient Gender: {report_data.get('patientGender', 'Not specified')}
- Risk Score: {risk_score}/100

Please provide:
1. A brief analysis of the incident (2-3 sentences)
2. Potential root causes (2-3 points)
3. Recommended immediate actions (2-3 points)
4. Long-term preventive measures (2-3 points)

Be concise, professional, and focus on patient safety.
Respond in the same language as the description if it's not in English."""

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        insight_text = message.content[0].text

        logger.info(f"Insight generated for report type: {report_data.get('type')}")

        return {
            "description": insight_text,
            "riskScore": risk_score,
            "confidence": 0.85,
            "explanation": f"AI analysis based on {report_data.get('type')} incident with {report_data.get('severity')} severity",
            "model": "claude-sonnet-4-20250514",
        }

    except ValueError as e:
        logger.warning(f"API key not configured: {e}")
        return _get_fallback_insight(report_data, risk_score)
    except Exception as e:
        logger.error(f"Error generating insight: {e}")
        return _get_fallback_insight(report_data, risk_score)

# ============================================
# GENERATE INSIGHT FOR MULTIPLE REPORTS (SIGNAL)
# ============================================
def generate_signal_insight(reports: list, patterns: list) -> dict:
    try:
        client = get_client()

        pattern_summary = "\n".join([
            f"- {p['pattern']} (frequency: {p['frequency']}, risk: {p['riskLevel']})"
            for p in patterns
        ])

        prompt = f"""You are a medical device vigilance expert. Analyze the following incident patterns detected in the system.

Total Reports Analyzed: {len(reports)}

Detected Patterns:
{pattern_summary}

Report Types Distribution:
{_get_type_distribution(reports)}

Severity Distribution:
{_get_severity_distribution(reports)}

Please provide:
1. Overall risk assessment (2-3 sentences)
2. Most critical patterns to address (2-3 points)
3. Recommended system-level actions (2-3 points)
4. Whether a product recall should be considered and why

Be concise, professional, and focus on patient safety."""

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        insight_text = message.content[0].text

        logger.info(f"Signal insight generated for {len(patterns)} patterns")

        return {
            "description": insight_text,
            "riskScore": _calculate_pattern_risk_score(patterns),
            "confidence": 0.80,
            "explanation": f"AI analysis based on {len(patterns)} detected patterns across {len(reports)} reports",
            "model": "claude-sonnet-4-20250514",
        }

    except ValueError as e:
        logger.warning(f"API key not configured: {e}")
        return _get_fallback_signal_insight(patterns)
    except Exception as e:
        logger.error(f"Error generating signal insight: {e}")
        return _get_fallback_signal_insight(patterns)

# ============================================
# HELPER FUNCTIONS
# ============================================
def _get_type_distribution(reports: list) -> str:
    from collections import Counter
    counts = Counter(r.get("type", "UNKNOWN") for r in reports)
    return "\n".join([f"- {k}: {v}" for k, v in counts.items()])

def _get_severity_distribution(reports: list) -> str:
    from collections import Counter
    counts = Counter(r.get("severity", "UNKNOWN") for r in reports)
    return "\n".join([f"- {k}: {v}" for k, v in counts.items()])

def _calculate_pattern_risk_score(patterns: list) -> float:
    if not patterns:
        return 0.0
    critical = sum(1 for p in patterns if p.get("riskLevel") == "CRITICAL")
    high = sum(1 for p in patterns if p.get("riskLevel") == "HIGH")
    score = min((critical * 30 + high * 15) / len(patterns), 100)
    return round(score, 2)

def _get_fallback_insight(report_data: dict, risk_score: float) -> dict:
    severity = report_data.get("severity", "UNKNOWN")
    report_type = report_data.get("type", "UNKNOWN")
    return {
        "description": (
            f"This {report_type} incident has been classified as {severity} severity "
            f"with a risk score of {risk_score}/100. "
            f"Immediate review is recommended for high-risk incidents."
        ),
        "riskScore": risk_score,
        "confidence": 0.60,
        "explanation": "Rule-based analysis (AI service unavailable)",
        "model": "fallback",
    }

def _get_fallback_signal_insight(patterns: list) -> dict:
    critical_count = sum(1 for p in patterns if p.get("riskLevel") == "CRITICAL")
    return {
        "description": (
            f"Pattern analysis detected {len(patterns)} patterns, "
            f"including {critical_count} critical patterns. "
            f"Immediate investigation is recommended."
        ),
        "riskScore": _calculate_pattern_risk_score(patterns),
        "confidence": 0.55,
        "explanation": "Rule-based analysis (AI service unavailable)",
        "model": "fallback",
    }