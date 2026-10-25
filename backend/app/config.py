"""Environment-driven configuration for the DuoHabits API."""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# The .env file lives at the repository root, while the app runs from backend/.
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

DEFAULT_DATABASE_URL = "postgresql+psycopg://duohabits:duohabits@localhost:5432/duohabits"
DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://duohabits:duohabits@localhost:5432/duohabits_test"


def _env_list(name: str) -> list[str]:
    """Return a comma-separated environment variable as a stripped list."""
    raw = os.environ.get(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_emails(name: str) -> list[str]:
    """Return a comma-separated email allowlist in lowercase."""
    return [item.lower() for item in _env_list(name)]


class Config:
    ENVIRONMENT = "base"
    SECRET_KEY = os.environ.get("SECRET_KEY", "")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    ALLOWED_EMAILS = _env_emails("ALLOWED_EMAILS")
    ALLOWED_ORIGINS = _env_list("ALLOWED_ORIGINS")
    DEFAULT_TIMEZONE = os.environ.get("DEFAULT_TIMEZONE", "Africa/Casablanca")
    CRON_SECRET = os.environ.get("CRON_SECRET", "")

    SESSION_COOKIE_NAME = "duohabits_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # Requests with a larger body are rejected before parsing (413).
    MAX_CONTENT_LENGTH = 64 * 1024

    RATELIMIT_STORAGE_URI = "memory://"
    JSON_SORT_KEYS = False


class DevelopmentConfig(Config):
    ENVIRONMENT = "development"
    DEBUG = True
    # Development-only fallback so `flask run` works without a .env file.
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-insecure-secret-key-change-me"


class TestingConfig(Config):
    ENVIRONMENT = "testing"
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    SECRET_KEY = os.environ.get("SECRET_KEY") or "testing-only-insecure-secret-key"


class ProductionConfig(Config):
    ENVIRONMENT = "production"
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "")


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def validate_production(config: dict) -> None:
    """Fail fast when production is booted without required secrets."""
    secret_key = config.get("SECRET_KEY") or ""
    if len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be set to at least 32 characters in production.")

    if not config.get("SQLALCHEMY_DATABASE_URI"):
        raise RuntimeError("DATABASE_URL must be set in production.")
