"""Shared pytest fixtures backed by a real PostgreSQL test database."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app import create_app
from app.extensions import db


@pytest.fixture(scope="session")
def app() -> Iterator[Flask]:
    """Session-wide app with the schema created from model metadata."""
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def db_session(app: Flask) -> Iterator[Session]:
    """Run each test inside one outer transaction, rolled back afterwards.

    The session is bound to the outer connection so application commits become
    savepoint releases and never leak between tests.
    """
    connection = db.engine.connect()
    transaction = connection.begin()

    # Flask-SQLAlchemy resolves binds through ``db.engines`` and ignores a
    # session-level bind, so point the app's default bind at this connection.
    engines = db.engines
    default_engine = engines[None]
    engines[None] = connection  # type: ignore[index]
    db.session.remove()
    db.session.configure(join_transaction_mode="create_savepoint")

    try:
        yield db.session
    finally:
        db.session.remove()
        db.session.configure(join_transaction_mode="conditional_savepoint")
        engines[None] = default_engine  # type: ignore[index]
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(app: Flask, db_session: Session) -> FlaskClient:
    return app.test_client()
