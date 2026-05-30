"""Configuration module for environment variable loading.

Loads AWS region, Box credentials, and Apify token from environment variables.
Uses python-dotenv for local development (.env file support).
"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

if os.getenv("AWS_PROFILE", "") == "":
    os.environ.pop("AWS_PROFILE", None)


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    # AWS Configuration
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")

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
