"""Shared extension instances, initialised by the application factory."""

from __future__ import annotations

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager, current_user
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()


def rate_limit_key() -> str:
    """Rate-limit authenticated users by id and everyone else by IP."""
    if current_user.is_authenticated:
        return f"user:{current_user.id}"
    return f"ip:{get_remote_address()}"


limiter = Limiter(key_func=rate_limit_key, default_limits=["120 per minute"])
