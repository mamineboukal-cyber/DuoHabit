"""Application factory for the DuoHabits API."""

from __future__ import annotations

import os

from flask import Flask

from . import models  # noqa: F401  (registers tables on the metadata for Alembic)
from .config import CONFIG_MAP, validate_production
from .errors import ApiError, register_error_handlers
from .extensions import db, limiter, login_manager, migrate
from .models import User
from .routes.auth import bp as auth_bp
from .routes.couple import bp as couple_bp
from .routes.habits import bp as habits_bp
from .routes.health import bp as health_bp
from .security import register_security


def _load_user(user_id: str) -> User | None:
    try:
        return db.session.get(User, int(user_id))
    except (TypeError, ValueError):
        return None


def _unauthorized() -> None:
    raise ApiError(401, "unauthenticated", "Authentication required.")


def create_app(config_name: str | None = None) -> Flask:
    """Create and configure a Flask application instance."""
    app = Flask(__name__, static_folder=None)

    selected = config_name or os.environ.get("FLASK_ENV", "development")
    if selected not in CONFIG_MAP:
        raise RuntimeError(f"Unknown FLASK_ENV: {selected!r}")

    app.config.from_object(CONFIG_MAP[selected])
    if selected == "production":
        validate_production(app.config)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    limiter.init_app(app)

    login_manager.user_loader(_load_user)
    login_manager.unauthorized_handler(_unauthorized)

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(couple_bp, url_prefix="/api")
    app.register_blueprint(habits_bp, url_prefix="/api")

    register_security(app)
    register_error_handlers(app)

    return app
