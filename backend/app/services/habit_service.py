"""Business logic for habits (no HTTP concerns)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..errors import ApiError
from ..extensions import db
from ..models import Habit, User
from . import couple_service

_NAME_TAKEN_MESSAGE = "You already have an active habit with that name."
_HABIT_NOT_FOUND_MESSAGE = "Habit not found."
_FORBIDDEN_MESSAGE = "You can only change your own habits."
_UNIQUE_INDEX_NAME = "uq_habits_owner_name_active"


def habit_payload(habit: Habit) -> dict[str, Any]:
    return {
        "id": habit.id,
        "owner_id": habit.owner_id,
        "name": habit.name,
        "emoji": habit.emoji,
        "difficulty": habit.difficulty,
        "schedule_days": sorted(habit.schedule_days),
        "current_streak": habit.current_streak,
        "best_streak": habit.best_streak,
        "archived_at": _isoformat(habit.archived_at),
        "created_at": _isoformat(habit.created_at),
    }


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def list_habits(user: User, *, owner: str, include_archived: bool) -> list[Habit]:
    couple = couple_service.get_couple(user)

    owner_id = user.id
    if owner == "partner":
        partner_id = db.session.scalar(
            select(User.id)
            .where(User.couple_id == couple.id, User.id != user.id)
            .order_by(User.id)
            .limit(1)
        )
        if partner_id is None:
            return []
        owner_id = partner_id

    statement = select(Habit).where(
        Habit.couple_id == couple.id,
        Habit.owner_id == owner_id,
    )
    if not include_archived:
        statement = statement.where(Habit.archived_at.is_(None))
    statement = statement.order_by(Habit.created_at.asc(), Habit.id.asc())

    return list(db.session.scalars(statement))


def create_habit(
    user: User,
    *,
    name: str,
    emoji: str | None,
    difficulty: int,
    schedule_days: list[int],
) -> Habit:
    couple = couple_service.get_couple(user)
    _ensure_name_available(user.id, name)

    habit = Habit(
        owner_id=user.id,
        couple_id=couple.id,
        name=name,
        emoji=emoji,
        difficulty=difficulty,
        schedule_days=schedule_days,
    )
    db.session.add(habit)

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        _raise_if_name_conflict(exc)
        raise

    return habit


def update_habit(user: User, habit_id: int, changes: dict[str, Any]) -> Habit:
    habit = _get_editable_habit(user, habit_id)

    for field in ("name", "difficulty", "schedule_days"):
        if field in changes and changes[field] is None:
            raise ApiError(
                422,
                "validation_error",
                "Invalid request data.",
                {field: "This field may not be null."},
            )

    if "name" in changes:
        _ensure_name_available(user.id, changes["name"], exclude_id=habit.id)

    for field in ("name", "emoji", "difficulty", "schedule_days"):
        if field in changes:
            setattr(habit, field, changes[field])

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        _raise_if_name_conflict(exc)
        raise

    return habit


def archive_habit(user: User, habit_id: int) -> None:
    habit = _get_editable_habit(user, habit_id)
    habit.archived_at = datetime.now(UTC)
    db.session.commit()


def _get_editable_habit(user: User, habit_id: int) -> Habit:
    habit = db.session.get(Habit, habit_id)

    if habit is None or habit.couple_id != user.couple_id:
        raise ApiError(404, "not_found", _HABIT_NOT_FOUND_MESSAGE)
    if habit.archived_at is not None:
        raise ApiError(404, "not_found", _HABIT_NOT_FOUND_MESSAGE)
    if habit.owner_id != user.id:
        raise ApiError(403, "forbidden", _FORBIDDEN_MESSAGE)

    return habit


def _ensure_name_available(owner_id: int, name: str, *, exclude_id: int | None = None) -> None:
    statement = select(Habit.id).where(
        Habit.owner_id == owner_id,
        Habit.archived_at.is_(None),
        func.lower(Habit.name) == name.lower(),
    )
    if exclude_id is not None:
        statement = statement.where(Habit.id != exclude_id)

    if db.session.scalar(statement) is not None:
        raise ApiError(409, "habit_name_taken", _NAME_TAKEN_MESSAGE)


def _raise_if_name_conflict(exc: IntegrityError) -> None:
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    if constraint == _UNIQUE_INDEX_NAME:
        raise ApiError(409, "habit_name_taken", _NAME_TAKEN_MESSAGE) from exc
