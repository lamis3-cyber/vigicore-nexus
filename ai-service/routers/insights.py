from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.insight_service import generate_report_insight, generate_signal_insight
from services.pattern_service import detect_patterns
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

class ReportData(BaseModel):
    type: str
    severity: str
    description: str
    location: Optional[str] = None
    patientAge: Optional[int] = None
    patientGender: Optional[str] = None
    deviceId: Optional[str] = None
    productId: Optional[str] = None
    departmentId: Optional[str] = None

class InsightRequest(BaseModel):
    report: ReportData
    riskScore: float

class SignalInsightRequest(BaseModel):
    reports: List[ReportData]

@router.post("/report")
async def get_report_insight(data: InsightRequest):
    try:
        result = generate_report_insight(
            data.report.model_dump(),
            data.riskScore
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Insight generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/signal")
async def get_signal_insight(data: SignalInsightRequest):
    try:
        reports = [r.model_dump() for r in data.reports]
        patterns_result = detect_patterns(reports)
        result = generate_signal_insight(reports, patterns_result["patterns"])
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Signal insight error: {e}")
        raise HTTPException(status_code=500, detail=str(e))