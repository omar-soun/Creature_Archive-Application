"""
Application configuration.

Uses pydantic-settings for type-safe environment variable loading.
All settings are loaded from environment variables or .env file.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent  # Backend/app/


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Firebase
    firebase_storage_bucket: str | None = None
    google_application_credentials: str | None = None

    # Paths
    service_account_path: Path = BASE_DIR / "service-account.json"
    species_data_path: Path = BASE_DIR / "data" / "species_data.json"

    # AnimalDetect API (server-side only — key never sent to client)
    animal_detect_api_key: str | None = None
    animal_detect_api_url: str = "https://www.animaldetect.com/api/v1/detect"

    # App
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
