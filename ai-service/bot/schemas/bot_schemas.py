from pydantic import BaseModel
from typing import Optional, List
from enum import Enum
from datetime import datetime


# ============================================
# ENUMS
# ============================================

class BotLanguage(str, Enum):
    FR = "FR"
    EN = "EN"

class BotSender(str, Enum):
    USER = "USER"
    BOT = "BOT"

class BotKnowledgeRole(str, Enum):
    ALL = "ALL"
    DOCTOR = "DOCTOR"
    MEDICAL_STAFF = "MEDICAL_STAFF"
    RESPONSABLE = "RESPONSABLE"
    TECHNICIAN = "TECHNICIAN"
    HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
    SUPPLIER_AGENT = "SUPPLIER_AGENT"
    AUTHORITY_AGENT = "AUTHORITY_AGENT"
    ADMIN = "ADMIN"

class BotProactiveAlertType(str, Enum):
    PANNE_RISK = "PANNE_RISK"
    REPORT_STALE = "REPORT_STALE"
    EXPIRY_SOON = "EXPIRY_SOON"
    PATTERN_DETECTED = "PATTERN_DETECTED"

class BotModelType(str, Enum):
    RULES = "RULES"
    ML = "ML"
    HYBRID = "HYBRID"


# ============================================
# CHAT SCHEMAS
# ============================================

class ChatMessageRequest(BaseModel):
    message: str
    userId: str
    userRole: str
    language: BotLanguage = BotLanguage.FR
    conversationId: Optional[str] = None
    context: Optional[dict] = None

class ChatMessageResponse(BaseModel):
    reply: str
    confidence: float
    sources: Optional[List[str]] = None
    conversationId: str
    suggestedActions: Optional[List[dict]] = None
    language: BotLanguage


# ============================================
# ANALYZE SCHEMAS
# ============================================

class AnalyzeReportRequest(BaseModel):
    reportId: str
    userId: str
    userRole: str
    language: BotLanguage = BotLanguage.FR

class AnalyzeReportResponse(BaseModel):
    reportId: str
    summary: str
    riskScore: float
    confidence: float
    recommendations: List[str]
    suggestedActions: List[dict]
    language: BotLanguage

class SupplierSolutionRequest(BaseModel):
    reportId: str
    userId: str
    language: BotLanguage = BotLanguage.FR

class SupplierSolutionResponse(BaseModel):
    reportId: str
    problemType: str
    solutions: List[dict]
    confidence: float
    language: BotLanguage


# ============================================
# PREDICT SCHEMAS
# ============================================

class PredictDeviceRequest(BaseModel):
    deviceId: str
    userId: str
    language: BotLanguage = BotLanguage.FR

class PredictDeviceResponse(BaseModel):
    deviceId: str
    riskLevel: str
    riskScore: float
    confidence: float
    reasons: List[str]
    recommendations: List[str]
    modelType: BotModelType
    language: BotLanguage


# ============================================
# KNOWLEDGE SCHEMAS
# ============================================

class KnowledgeSearchRequest(BaseModel):
    query: str
    userRole: str
    language: BotLanguage = BotLanguage.FR

class KnowledgeSearchResponse(BaseModel):
    answer: str
    confidence: float
    category: str
    language: BotLanguage

class KnowledgeCreateRequest(BaseModel):
    category: str
    question_fr: str
    answer_fr: str
    question_en: str
    answer_en: str
    role: BotKnowledgeRole = BotKnowledgeRole.ALL

class KnowledgeUpdateRequest(BaseModel):
    category: Optional[str] = None
    question_fr: Optional[str] = None
    answer_fr: Optional[str] = None
    question_en: Optional[str] = None
    answer_en: Optional[str] = None
    role: Optional[BotKnowledgeRole] = None
    isActive: Optional[bool] = None


# ============================================
# PROACTIVE ALERT SCHEMAS
# ============================================

class ProactiveAlertResponse(BaseModel):
    id: str
    type: BotProactiveAlertType
    message: str
    confidence: float
    isSeen: bool
    sentAt: datetime
    deviceId: Optional[str] = None
    reportId: Optional[str] = None


# ============================================
# ADMIN SCHEMAS
# ============================================

class AdminStatsResponse(BaseModel):
    totalMessages: int
    byRole: Optional[dict] = None
    byTopic: Optional[dict] = None
    avgConfidence: Optional[float] = None
    alertsSent: int

class MLPerformanceResponse(BaseModel):
    version: str
    type: BotModelType
    accuracy: Optional[float] = None
    trainedAt: Optional[datetime] = None
    isActive: bool

