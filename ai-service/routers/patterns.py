from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.pattern_service import detect_patterns, recommend_recall
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

class ReportData(BaseModel):
    type: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    deviceId: Optional[str] = None
    productId: Optional[str] = None
    departmentId: Optional[str] = None

class ReportsList(BaseModel):
    reports: List[ReportData]

class RecallRequest(BaseModel):
    reports: List[ReportData]
    productId: str

@router.post("/detect")
async def detect(data: ReportsList):
    try:
        result = detect_patterns([r.model_dump() for r in data.reports])
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Pattern detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recall-recommendation")
async def recall_recommendation(data: RecallRequest):
    try:
        result = recommend_recall(
            [r.model_dump() for r in data.reports],
            data.productId
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Recall recommendation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))