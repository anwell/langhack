"""FastAPI application entry point.

Provides the main app instance and health check endpoint.
"""

from fastapi import FastAPI

from app.config import get_settings
from app.voice import router as voice_router

app = FastAPI(
    title="Voice Language Practice API",
    description="Backend for real-time voice language practice with AI",
    version="0.1.0",
)

app.include_router(voice_router)


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring and readiness probes."""
    settings = get_settings()
    return {
        "status": "healthy",
        "region": settings.aws_region,
    }
