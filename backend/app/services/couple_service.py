"""Business logic for couple pairing (no HTTP concerns)."""

from __future__ import annotations

import secrets
from datetime import UTC
from typing import Any

from flask import current_app
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..errors import ApiError
from ..extensions import db
from ..models import Couple, User

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_CODE_LENGTH = 8
_MAX_INVITE_ATTEMPTS = 5

_ALREADY_IN_COUPLE_MESSAGE = "You are already in a couple."
_COUPLE_FULL_MESSAGE = "This couple already has two members."
_INVALID_CODE_MESSAGE = "That invite code is not valid."
_NO_COUPLE_MESSAGE = "You are not in a couple yet."


def generate_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))


def couple_payload(couple: Couple) -> dict[str, Any]:
    members = sorted(couple.members, key=lambda member: member.id)
    created_at = couple.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)

    return {
        "id": couple.id,
        "timezone": couple.timezone,
        "invite_code": None if len(members) >= 2 else couple.invite_code.strip(),
        "members": [{"id": member.id, "display_name": member.display_name} for member in members],
        "created_at": created_at.astimezone(UTC).isoformat(),
    }


def create_couple(user: User, timezone_name: str | None) -> Couple:
    if user.couple_id is not None:
        raise ApiError(409, "already_in_couple", _ALREADY_IN_COUPLE_MESSAGE)

    timezone = timezone_name or current_app.config["DEFAULT_TIMEZONE"]

    for attempt in range(_MAX_INVITE_ATTEMPTS):
        couple = Couple(invite_code=generate_invite_code(), timezone=timezone)
        couple.members.append(user)
        db.session.add(couple)

        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            if attempt == _MAX_INVITE_ATTEMPTS - 1:
                raise
            continue

        return couple

    # Unreachable: the loop either returns or re-raises on the last attempt.
    raise RuntimeError("Could not generate a unique invite code.")


def join_couple(user: User, invite_code: str) -> Couple:
    if user.couple_id is not None:
        raise ApiError(409, "already_in_couple", _ALREADY_IN_COUPLE_MESSAGE)

    couple = db.session.scalar(
        select(Couple).where(Couple.invite_code == invite_code).with_for_update()
    )
    if couple is None:
        raise ApiError(404, "invalid_code", _INVALID_CODE_MESSAGE)

    member_count = db.session.scalar(
        select(func.count()).select_from(User).where(User.couple_id == couple.id)
    )
    if member_count >= 2:
        raise ApiError(409, "couple_full", _COUPLE_FULL_MESSAGE)

    user.couple = couple
    db.session.commit()
    return couple


def get_couple(user: User) -> Couple:
    if user.couple_id is None:
        raise ApiError(409, "no_couple", _NO_COUPLE_MESSAGE)

    couple = db.session.get(Couple, user.couple_id)
    if couple is None:
        raise ApiError(409, "no_couple", _NO_COUPLE_MESSAGE)

    return couple


def update_timezone(user: User, timezone: str) -> Couple:
    couple = get_couple(user)
    couple.timezone = timezone
    db.session.commit()
    return couple
