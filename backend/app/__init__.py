"""Application factory for the DuoHabits API."""

from __future__ import annotations

import os

from flask import Flask

from . import models  # noqa: F401  (registers tables on the metadata for Alembic)
from .config import CONFIG_MAP, validate_production
from .errors import register_error_handlers
from .extensions import db, limiter, login_manager, migrate
from .routes.health import bp as health_bp


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

    app.register_blueprint(health_bp, url_prefix="/api")
    register_error_handlers(app)

    return app
