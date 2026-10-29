from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.scoring_service import score_report, predict_risk_trend
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
    isAnonymous: Optional[bool] = False
    deviceId: Optional[str] = None
    productId: Optional[str] = None
    departmentId: Optional[str] = None

class ReportsList(BaseModel):
    reports: List[ReportData]

@router.post("/score")
async def score_single_report(report: ReportData):
    try:
        result = score_report(report.model_dump())
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Scoring error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict-trend")
async def predict_trend(data: ReportsList):
    try:
        result = predict_risk_trend([r.model_dump() for r in data.reports])
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))