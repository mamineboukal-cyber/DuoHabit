"""Business logic for authentication (no HTTP concerns)."""

from __future__ import annotations

from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import current_app
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..errors import ApiError
from ..extensions import db
from ..models import User

_password_hasher = PasswordHasher()

_INVALID_CREDENTIALS_MESSAGE = "Wrong email or password."
_EMAIL_TAKEN_MESSAGE = "An account with this email already exists."


def user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "couple_id": user.couple_id,
    }


def _registration_closed(email: str) -> bool:
    allowed = {str(item).lower() for item in current_app.config.get("ALLOWED_EMAILS") or []}
    return bool(allowed) and email not in allowed


def register_user(*, email: str, password: str, display_name: str) -> User:
    email = email.strip().lower()

    if _registration_closed(email):
        raise ApiError(403, "registration_closed", "Registration is closed.")

    exists = db.session.scalar(select(User.id).where(User.email == email))
    if exists is not None:
        raise ApiError(409, "email_taken", _EMAIL_TAKEN_MESSAGE)

    user = User(
        email=email,
        password_hash=_password_hasher.hash(password),
        display_name=display_name,
    )
    db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError as exc:
        # Covers the race between the check above and the INSERT.
        db.session.rollback()
        raise ApiError(409, "email_taken", _EMAIL_TAKEN_MESSAGE) from exc

    return user


def authenticate(*, email: str, password: str) -> User:
    user = db.session.scalar(select(User).where(User.email == email.strip().lower()))

    if user is None:
        raise ApiError(401, "invalid_credentials", _INVALID_CREDENTIALS_MESSAGE)

    try:
        _password_hasher.verify(user.password_hash, password)
    except (VerificationError, InvalidHashError) as exc:
        raise ApiError(401, "invalid_credentials", _INVALID_CREDENTIALS_MESSAGE) from exc

    return user


def update_display_name(user: User, display_name: str) -> User:
    user.display_name = display_name
    db.session.commit()
    return user
