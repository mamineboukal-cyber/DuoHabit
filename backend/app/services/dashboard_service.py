"""Business logic for the Today dashboard (no HTTP concerns)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select

from ..errors import ApiError
from ..extensions import db
from ..models import Checkin, Couple, Habit, User
from . import scoring, streaks
from .couple_service import get_couple
from .habit_service import habit_payload
from .timeutil import today_in_tz

_DATE_OUT_OF_RANGE_MESSAGE = "You can only view today or yesterday."


def today_payload(user: User, target_date: date | None = None) -> dict[str, Any]:
    """Build the ``GET /api/today`` payload for ``user``.

    Without ``target_date`` this is the normal today dashboard. The optional
    date query only supports today and yesterday, matching the check-in window.
    """
    couple = get_couple(user)
    today = today_in_tz(couple.timezone)
    selected_date = today if target_date is None else target_date

    if selected_date not in {today, today - timedelta(days=1)}:
        raise ApiError(422, "date_out_of_range", _DATE_OUT_OF_RANGE_MESSAGE)

    members = _members(couple)
    habits = _habits_scheduled_on(couple, selected_date.weekday())
    checkin_dates = _checkin_dates([habit.id for habit in habits])
    selected_checkins = _checkins_on(members, selected_date)
    totals = _total_xp(members)

    habits_by_owner: dict[int, list[Habit]] = {}
    for habit in habits:
        habits_by_owner.setdefault(habit.owner_id, []).append(habit)

    def block(member: User) -> dict[str, Any]:
        return _user_block(
            member,
            habits_by_owner.get(member.id, []),
            checkin_dates,
            selected_checkins[member.id],
            totals[member.id],
            selected_date,
            include_streak_preview=target_date is not None,
        )

    partner_user = next((member for member in members if member.id != user.id), None)

    return {
        "date": selected_date.isoformat(),
        "timezone": couple.timezone,
        "me": block(user),
        "partner": None if partner_user is None else block(partner_user),
    }


def _members(couple: Couple) -> list[User]:
    return list(
        db.session.scalars(select(User).where(User.couple_id == couple.id).order_by(User.id.asc()))
    )


def _habits_scheduled_on(couple: Couple, weekday: int) -> list[Habit]:
    """Active habits of the couple that are scheduled for ``weekday`` (0 = Monday)."""
    habits = db.session.scalars(
        select(Habit)
        .where(Habit.couple_id == couple.id, Habit.archived_at.is_(None))
        .order_by(Habit.created_at.asc(), Habit.id.asc())
    )
    return [habit for habit in habits if weekday in habit.schedule_days]


def _checkin_dates(habit_ids: list[int]) -> dict[int, set[date]]:
    """Map every listed habit to its check-in dates."""
    dates: dict[int, set[date]] = {habit_id: set() for habit_id in habit_ids}
    if not habit_ids:
        return dates

    rows = db.session.execute(
        select(Checkin.habit_id, Checkin.checkin_date).where(Checkin.habit_id.in_(habit_ids))
    )
    for habit_id, checkin_date in rows:
        dates[habit_id].add(checkin_date)
    return dates


def _checkins_on(members: list[User], day: date) -> dict[int, dict[int, tuple[int, int]]]:
    """Map each member to ``{habit_id: (points, streak_at_checkin)}`` for ``day``.

    This intentionally includes archived habits and habits no longer scheduled
    that day, so the day's points always agree with ``total_xp``.
    """
    checkins: dict[int, dict[int, tuple[int, int]]] = {member.id: {} for member in members}
    if not members:
        return checkins

    statement = select(
        Checkin.user_id,
        Checkin.habit_id,
        Checkin.points,
        Checkin.streak_at_checkin,
    ).where(
        Checkin.user_id.in_([member.id for member in members]),
        Checkin.checkin_date == day,
    )
    for user_id, habit_id, checkin_points, streak_at_checkin in db.session.execute(statement):
        checkins[user_id][habit_id] = (checkin_points, streak_at_checkin)
    return checkins


def _total_xp(members: list[User]) -> dict[int, int]:
    totals = {member.id: 0 for member in members}
    if not members:
        return totals

    statement = (
        select(Checkin.user_id, func.sum(Checkin.points))
        .where(Checkin.user_id.in_([member.id for member in members]))
        .group_by(Checkin.user_id)
    )
    for user_id, total in db.session.execute(statement):
        totals[user_id] = total or 0
    return totals


def _user_block(
    member: User,
    habits: list[Habit],
    checkin_dates: dict[int, set[date]],
    checkins: dict[int, tuple[int, int]],
    total_xp: int,
    day: date,
    *,
    include_streak_preview: bool,
) -> dict[str, Any]:
    level, xp_into_level, xp_for_next_level = scoring.xp_progress(total_xp)

    rows: list[dict[str, Any]] = []
    for habit in habits:
        checkin = checkins.get(habit.id)
        done = checkin is not None

        if checkin is not None:
            checkin_points, streak_if_done = checkin
            # PLAN section 7's example shows 11/10 for a done habit, which
            # section 2 cannot produce; a done habit reports what it earned.
            points_if_done = checkin_points
        else:
            checkin_points = None
            streak_if_done = streaks.streak_at_checkin(
                habit.schedule_days,
                checkin_dates.get(habit.id, set()) | {day},
                day,
            )
            points_if_done = scoring.points(habit.difficulty, streak_if_done)

        row: dict[str, Any] = {
            "habit": habit_payload(habit),
            "done": done,
            "points_if_done": points_if_done,
            "checkin_points": checkin_points,
        }
        # The no-parameter payload is unchanged; the dated payload adds the
        # exact streak a check-in would produce (needed for the Yesterday tab).
        if include_streak_preview:
            row["streak_if_done"] = streak_if_done
        rows.append(row)

    return {
        "user": {"id": member.id, "display_name": member.display_name},
        "level": level,
        "total_xp": total_xp,
        "xp_into_level": xp_into_level,
        "xp_for_next_level": xp_for_next_level,
        "today_points": sum(points for points, _ in checkins.values()),
        "habits": rows,
    }
