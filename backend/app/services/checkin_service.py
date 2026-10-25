"""Business logic for check-ins (no HTTP concerns)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..errors import ApiError
from ..extensions import db
from ..models import Checkin, Couple, Habit, User
from . import scoring, streaks
from .timeutil import today_in_tz

_HABIT_NOT_FOUND_MESSAGE = "Habit not found."
_FORBIDDEN_MESSAGE = "You can only check in your own habits."
_HABIT_ARCHIVED_MESSAGE = "This habit is archived."
_ALREADY_CHECKED_IN_MESSAGE = "This habit is already checked in for that date."
_DATE_OUT_OF_RANGE_MESSAGE = "You can only check in for today or yesterday."
_NOT_SCHEDULED_MESSAGE = "This habit is not scheduled for that day."
_CHECKIN_NOT_FOUND_MESSAGE = "Check-in not found."
_UNIQUE_CONSTRAINT_NAME = "uq_checkins_habit_id_checkin_date"


def checkin_payload(checkin: Checkin) -> dict[str, Any]:
    return {
        "id": checkin.id,
        "habit_id": checkin.habit_id,
        "checkin_date": checkin.checkin_date.isoformat(),
        "points": checkin.points,
        "streak_at_checkin": checkin.streak_at_checkin,
    }


def create_checkin(
    user: User,
    habit_id: int,
    checkin_date: date,
) -> tuple[Checkin, Habit, int, int]:
    habit = _get_owned_habit(user, habit_id)

    if habit.archived_at is not None:
        raise ApiError(409, "habit_archived", _HABIT_ARCHIVED_MESSAGE)

    today = _today_for(habit)
    _ensure_date_in_window(checkin_date, today)

    if checkin_date.weekday() not in habit.schedule_days:
        raise ApiError(422, "not_scheduled", _NOT_SCHEDULED_MESSAGE)

    if _existing_checkin_id(habit.id, checkin_date) is not None:
        raise ApiError(409, "already_checked_in", _ALREADY_CHECKED_IN_MESSAGE)

    dates = _checkin_dates(habit.id)
    streak_at_checkin = streaks.streak_at_checkin(
        habit.schedule_days,
        dates | {checkin_date},
        checkin_date,
    )
    checkin = Checkin(
        habit_id=habit.id,
        user_id=user.id,
        checkin_date=checkin_date,
        points=scoring.points(habit.difficulty, streak_at_checkin),
        streak_at_checkin=streak_at_checkin,
    )
    db.session.add(checkin)

    try:
        db.session.flush()
        _recompute_streaks(habit, today)
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        _raise_if_duplicate(exc)
        raise

    total_xp = _total_xp(user.id)
    return checkin, habit, total_xp, scoring.level_for_xp(total_xp)


def undo_checkin(
    user: User,
    habit_id: int,
    checkin_date: date,
) -> tuple[Habit, int, int]:
    habit = _get_owned_habit(user, habit_id)

    today = _today_for(habit)
    _ensure_date_in_window(checkin_date, today)

    checkin = db.session.scalar(
        select(Checkin).where(
            Checkin.habit_id == habit.id,
            Checkin.checkin_date == checkin_date,
        )
    )
    if checkin is None:
        raise ApiError(404, "not_found", _CHECKIN_NOT_FOUND_MESSAGE)

    db.session.delete(checkin)
    db.session.flush()
    _recompute_streaks(habit, today)
    db.session.commit()

    total_xp = _total_xp(user.id)
    return habit, total_xp, scoring.level_for_xp(total_xp)


def _get_owned_habit(user: User, habit_id: int) -> Habit:
    habit = db.session.get(Habit, habit_id)

    if habit is None or habit.couple_id != user.couple_id:
        raise ApiError(404, "not_found", _HABIT_NOT_FOUND_MESSAGE)
    if habit.owner_id != user.id:
        raise ApiError(403, "forbidden", _FORBIDDEN_MESSAGE)

    return habit


def _today_for(habit: Habit) -> date:
    couple = db.session.get(Couple, habit.couple_id)
    if couple is None:
        # The FK makes this unreachable, but never fall back to the server timezone.
        raise ApiError(404, "not_found", _HABIT_NOT_FOUND_MESSAGE)
    return today_in_tz(couple.timezone)


def _ensure_date_in_window(checkin_date: date, today: date) -> None:
    if checkin_date not in {today, today - timedelta(days=1)}:
        raise ApiError(422, "date_out_of_range", _DATE_OUT_OF_RANGE_MESSAGE)


def _existing_checkin_id(habit_id: int, checkin_date: date) -> int | None:
    return db.session.scalar(
        select(Checkin.id).where(
            Checkin.habit_id == habit_id,
            Checkin.checkin_date == checkin_date,
        )
    )


def _checkin_dates(habit_id: int) -> set[date]:
    return set(db.session.scalars(select(Checkin.checkin_date).where(Checkin.habit_id == habit_id)))


def _recompute_streaks(habit: Habit, today: date) -> None:
    dates = _checkin_dates(habit.id)
    habit.current_streak = streaks.current_streak(habit.schedule_days, dates, today)
    habit.best_streak = streaks.best_streak(
        habit.schedule_days,
        dates,
        habit.best_streak,
    )


def _total_xp(user_id: int) -> int:
    total = db.session.scalar(
        select(func.coalesce(func.sum(Checkin.points), 0)).where(Checkin.user_id == user_id)
    )
    return total or 0


def _raise_if_duplicate(exc: IntegrityError) -> None:
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    if constraint == _UNIQUE_CONSTRAINT_NAME:
        raise ApiError(409, "already_checked_in", _ALREADY_CHECKED_IN_MESSAGE) from exc
