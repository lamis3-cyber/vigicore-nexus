import hmac
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
load_dotenv()

from routers import scoring, patterns, insights
from bot.routers import chat, analyze, predict, alerts, knowledge, admin
from bot.crons.scheduler import start_scheduler, stop_scheduler
from utils.logger import get_logger

logger = get_logger(__name__)

IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"
SERVICE_TOKEN = os.getenv("BOT_SERVICE_TOKEN", "").strip()

app = FastAPI(
    title="MaterioVigilance AI Service",
    description="AI-powered analysis for medical device vigilance + VigiBot",
    version="2.0.0",
    # Interactive docs only in development (they map every endpoint for anyone who can reach the port).
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)


# ============================================
# AUTHENTIFICATION DE SERVICE
# ============================================
# Ce service n'est appelé que par les backends (jamais par le navigateur). Si BOT_SERVICE_TOKEN est défini,
# chaque appel (hors /health) doit présenter ce jeton : `Authorization: Bearer <jeton>` ou `X-Service-Token: <jeton>`.
# Le même jeton est à configurer côté appelant (audit-api). En production, ne publiez jamais le port 8000.
async def require_service_token(request: Request):
    if not SERVICE_TOKEN:
        return
    auth = request.headers.get("authorization", "")
    presented = auth[7:].strip() if auth.lower().startswith("bearer ") else request.headers.get("x-service-token", "").strip()
    if not presented or not hmac.compare_digest(presented.encode(), SERVICE_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


# Les erreurs internes (detail=str(e) dans les routes) ne sont jamais renvoyées telles quelles en production :
# elles sont journalisées côté serveur et le client reçoit un message générique.
@app.exception_handler(FastAPIHTTPException)
async def hide_internal_errors(request: Request, exc: FastAPIHTTPException):
    if exc.status_code >= 500 and IS_PRODUCTION:
        logger.error(f"{request.method} {request.url.path} -> {exc.status_code}: {exc.detail}")
        return JSONResponse(status_code=exc.status_code, content={"detail": "Internal server error"})
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:5173"),
        os.getenv("BACKEND_URL", "http://localhost:5000"),
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# ROUTERS EXISTANTS
# ============================================
protected = [Depends(require_service_token)]
app.include_router(scoring.router, prefix="/ai/scoring", tags=["Scoring"], dependencies=protected)
app.include_router(patterns.router, prefix="/ai/patterns", tags=["Patterns"], dependencies=protected)
app.include_router(insights.router, prefix="/ai/insights", tags=["Insights"], dependencies=protected)

# ============================================
# ROUTERS VIGIBOT
# ============================================
app.include_router(chat.router, prefix="/bot/chat", tags=["VigiBot Chat"], dependencies=protected)
app.include_router(analyze.router, prefix="/bot/analyze", tags=["VigiBot Analyze"], dependencies=protected)
app.include_router(predict.router, prefix="/bot/predict", tags=["VigiBot Predict"], dependencies=protected)
app.include_router(alerts.router, prefix="/bot/alerts", tags=["VigiBot Alerts"], dependencies=protected)
app.include_router(knowledge.router, prefix="/bot/knowledge", tags=["VigiBot Knowledge"], dependencies=protected)
app.include_router(admin.router, prefix="/bot/admin", tags=["VigiBot Admin"], dependencies=protected)

# ============================================
# LIFECYCLE
# ============================================
@app.on_event("startup")
async def startup():
    if IS_PRODUCTION and not SERVICE_TOKEN:
        logger.warning("BOT_SERVICE_TOKEN is not set: endpoints are NOT authenticated. Keep port 8000 on the private network only.")
    start_scheduler()
    logger.info("🤖 VigiBot started successfully")

@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()
    logger.info("🛑 VigiBot stopped")

# Health check
@app.get("/health")
async def health():
    return {
        "status": "OK",
        "service": "MaterioVigilance AI Service + VigiBot",
        "version": "2.0.0",
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    logger.info(f"🤖 AI Service + VigiBot starting on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
