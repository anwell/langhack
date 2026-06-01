"""Configuration module for environment variable loading.

Loads AWS region, Box credentials, and Apify token from environment variables.
Uses python-dotenv for local development (.env file support).
"""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

# Load root-level defaults first, then backend/.env so the documented backend
# secrets file works no matter whether uvicorn is started from the repository
# root or from the backend directory.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)

if os.getenv("AWS_PROFILE", "") == "":
    os.environ.pop("AWS_PROFILE", None)


def env_bool(name: str, default: bool = False) -> bool:
    """Read a boolean environment variable."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    # AWS Configuration
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    voice_enable_sonic_tools: bool = env_bool("VOICE_ENABLE_SONIC_TOOLS", False)

    # Box.com Credentials
    box_client_id: str = os.getenv("BOX_CLIENT_ID", "")
    box_client_secret: str = os.getenv("BOX_CLIENT_SECRET", "")
    box_developer_token: str = os.getenv("BOX_DEVELOPER_TOKEN", "")
    box_folder_id: str = os.getenv("BOX_FOLDER_ID", "")

    # Apify Configuration
    apify_token: str = os.getenv("APIFY_TOKEN", "")

    # Server Configuration
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
