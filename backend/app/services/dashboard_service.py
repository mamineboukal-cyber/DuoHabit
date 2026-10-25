"""Business logic for the Today dashboard (no HTTP concerns)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select

from ..extensions import db
from ..models import Checkin, Couple, Habit, User
from . import scoring, streaks
from .couple_service import get_couple
from .habit_service import habit_payload
from .timeutil import today_in_tz


def today_payload(user: User) -> dict[str, Any]:
    """Build the ``GET /api/today`` payload for ``user``."""
    couple = get_couple(user)
    today = today_in_tz(couple.timezone)

    members = _members(couple)
    habits = _habits_scheduled_today(couple, today.weekday())
    checkin_dates = _checkin_dates([habit.id for habit in habits])
    today_checkins = _today_checkins(members, today)
    totals = _total_xp(members)

    habits_by_owner: dict[int, list[Habit]] = {}
    for habit in habits:
        habits_by_owner.setdefault(habit.owner_id, []).append(habit)

    def block(member: User) -> dict[str, Any]:
        return _user_block(
            member,
            habits_by_owner.get(member.id, []),
            checkin_dates,
            today_checkins[member.id],
            totals[member.id],
            today,
        )

    partner_user = next((member for member in members if member.id != user.id), None)

    return {
        "date": today.isoformat(),
        "timezone": couple.timezone,
        "me": block(user),
        "partner": None if partner_user is None else block(partner_user),
    }


def _members(couple: Couple) -> list[User]:
    return list(
        db.session.scalars(select(User).where(User.couple_id == couple.id).order_by(User.id.asc()))
    )


def _habits_scheduled_today(couple: Couple, weekday: int) -> list[Habit]:
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


def _today_checkins(members: list[User], today: date) -> dict[int, dict[int, int]]:
    """Map each member to ``{habit_id: points}`` for check-ins dated ``today``.

    This intentionally includes archived habits and habits no longer scheduled
    today, so ``today_points`` always agrees with ``total_xp``.
    """
    points: dict[int, dict[int, int]] = {member.id: {} for member in members}
    if not members:
        return points

    statement = select(Checkin.user_id, Checkin.habit_id, Checkin.points).where(
        Checkin.user_id.in_([member.id for member in members]),
        Checkin.checkin_date == today,
    )
    for user_id, habit_id, checkin_points in db.session.execute(statement):
        points[user_id][habit_id] = checkin_points
    return points


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
    today_checkins: dict[int, int],
    total_xp: int,
    today: date,
) -> dict[str, Any]:
    level, xp_into_level, xp_for_next_level = scoring.xp_progress(total_xp)

    rows: list[dict[str, Any]] = []
    for habit in habits:
        checkin_points = today_checkins.get(habit.id)
        done = checkin_points is not None
        # PLAN section 7's example shows 11/10 for a done habit, which section 2
        # cannot produce; a done habit reports the points it actually earned.
        points_if_done = (
            checkin_points
            if done
            else scoring.points(
                habit.difficulty,
                streaks.streak_at_checkin(
                    habit.schedule_days,
                    checkin_dates.get(habit.id, set()) | {today},
                    today,
                ),
            )
        )
        rows.append(
            {
                "habit": habit_payload(habit),
                "done": done,
                "points_if_done": points_if_done,
                "checkin_points": checkin_points,
            }
        )

    return {
        "user": {"id": member.id, "display_name": member.display_name},
        "level": level,
        "total_xp": total_xp,
        "xp_into_level": xp_into_level,
        "xp_for_next_level": xp_for_next_level,
        "today_points": sum(today_checkins.values()),
        "habits": rows,
    }
