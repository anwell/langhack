"""FastAPI application entry point.

Provides the main app instance and health check endpoint.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.box_upload import router as box_upload_router
from app.config import get_settings
from app.scenario_agent import router as scenario_agent_router
from app.scenarios import router as scenarios_router
from app.suggest import router as suggest_router
from app.teacher_agent import router as teacher_agent_router
from app.voice import router as voice_router

app = FastAPI(
    title="Voice Language Practice API",
    description="Backend for real-time voice language practice with AI",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice_router)
app.include_router(scenarios_router)
app.include_router(scenario_agent_router)
app.include_router(teacher_agent_router)
app.include_router(box_upload_router)
app.include_router(suggest_router)


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring and readiness probes."""
    settings = get_settings()
    return {
        "status": "healthy",
        "region": settings.aws_region,
    }
