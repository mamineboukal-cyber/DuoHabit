"""Business logic for the weekly duel (no HTTP concerns)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Date, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..extensions import db
from ..models import Checkin, Couple, User, WeeklyResult
from .couple_service import get_couple
from .timeutil import today_in_tz, week_end, week_start

# A14 allows logging yesterday, so the previous week can still receive a Sunday
# check-in during Monday. A week is therefore finalizable only from Tuesday on.
_GRACE_DAYS = 2


def current_duel(user: User) -> dict[str, Any]:
    """Build the ``GET /api/duel/current`` payload for ``user``."""
    couple = get_couple(user)
    today = today_in_tz(couple.timezone)
    finalize_past_weeks(couple, today)

    start = week_start(today)
    end = week_end(today)
    members = _members(couple)
    stats = _week_stats([member.id for member in members], start, end)

    me = _member_block(user, stats)
    partner_user = next((member for member in members if member.id != user.id), None)
    partner = None if partner_user is None else _member_block(partner_user, stats)

    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "days_left": 7 - today.weekday(),
        "me": me,
        "partner": partner,
        "leader": _leader(me, partner),
        "tally": _tally(couple, user, partner_user),
    }


def history(user: User, limit: int) -> list[dict[str, Any]]:
    """Return the couple's finalized weeks, newest first."""
    couple = get_couple(user)
    finalize_past_weeks(couple, today_in_tz(couple.timezone))

    rows = db.session.scalars(
        select(WeeklyResult)
        .where(WeeklyResult.couple_id == couple.id)
        .order_by(WeeklyResult.week_start.desc())
        .limit(limit)
    )
    return [_history_row(row, user.id) for row in rows]


def finalize_past_weeks(couple: Couple, today: date) -> None:
    """Store every completed week that has no row yet (idempotent)."""
    members = _members(couple)
    if len(members) < 2:
        # weekly_results needs both members; a solo couple has no duel yet.
        return

    first_week = _first_finalizable_week(couple, members)
    last_week = _last_finalizable_week(today)
    if first_week > last_week:
        return

    existing = set(
        db.session.scalars(
            select(WeeklyResult.week_start).where(WeeklyResult.couple_id == couple.id)
        )
    )
    missing = [week for week in _weeks(first_week, last_week) if week not in existing]
    if not missing:
        return

    user_a, user_b = members[0], members[1]
    totals = _weekly_totals([user_a.id, user_b.id], missing[0], missing[-1])
    rows: list[dict[str, Any]] = []
    for week in missing:
        week_totals = totals.get(week, {})
        a_points = week_totals.get(user_a.id, 0)
        b_points = week_totals.get(user_b.id, 0)
        if a_points == b_points:
            winner_user_id = None
        else:
            winner_user_id = user_a.id if a_points > b_points else user_b.id
        rows.append(
            {
                "couple_id": couple.id,
                "week_start": week,
                "user_a_id": user_a.id,
                "user_a_points": a_points,
                "user_b_id": user_b.id,
                "user_b_points": b_points,
                "winner_user_id": winner_user_id,
            }
        )

    statement = (
        pg_insert(WeeklyResult)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["couple_id", "week_start"])
    )
    db.session.execute(statement)
    db.session.commit()


def _members(couple: Couple) -> list[User]:
    return list(
        db.session.scalars(select(User).where(User.couple_id == couple.id).order_by(User.id.asc()))
    )


def _first_finalizable_week(couple: Couple, members: list[User]) -> date:
    """First week that can be stored: no week before the couple or a member existed."""
    timezone = ZoneInfo(couple.timezone)
    started = [_local_date(couple.created_at, timezone)] + [
        _local_date(member.created_at, timezone) for member in members
    ]
    return week_start(max(started))


def _local_date(value: datetime, timezone: ZoneInfo) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(timezone).date()


def _last_finalizable_week(today: date) -> date:
    """Newest week that can no longer receive a check-in (see ``_GRACE_DAYS``)."""
    return week_start(today - timedelta(days=6 + _GRACE_DAYS))


def _weeks(first_week: date, last_week: date) -> list[date]:
    weeks: list[date] = []
    week = first_week
    while week <= last_week:
        weeks.append(week)
        week += timedelta(days=7)
    return weeks


def _weekly_totals(
    user_ids: list[int],
    first_week: date,
    last_week: date,
) -> dict[date, dict[int, int]]:
    """Map each week to ``{user_id: points}`` for the given range."""
    week_column = func.date_trunc("week", Checkin.checkin_date).cast(Date)
    statement = (
        select(week_column, Checkin.user_id, func.sum(Checkin.points))
        .where(
            Checkin.user_id.in_(user_ids),
            Checkin.checkin_date >= first_week,
            Checkin.checkin_date <= last_week + timedelta(days=6),
        )
        .group_by(week_column, Checkin.user_id)
    )

    totals: dict[date, dict[int, int]] = {}
    for week, user_id, points in db.session.execute(statement):
        totals.setdefault(week, {})[user_id] = points
    return totals


def _week_stats(user_ids: list[int], start: date, end: date) -> dict[int, tuple[int, int]]:
    statement = (
        select(
            Checkin.user_id,
            func.coalesce(func.sum(Checkin.points), 0),
            func.count(),
        )
        .where(
            Checkin.user_id.in_(user_ids),
            Checkin.checkin_date.between(start, end),
        )
        .group_by(Checkin.user_id)
    )
    return {
        user_id: (points, checkins) for user_id, points, checkins in db.session.execute(statement)
    }


def _member_block(member: User, stats: dict[int, tuple[int, int]]) -> dict[str, Any]:
    points, checkins = stats.get(member.id, (0, 0))
    return {
        "user_id": member.id,
        "display_name": member.display_name,
        "points": points,
        "checkins": checkins,
    }


def _leader(me: dict[str, Any], partner: dict[str, Any] | None) -> str:
    if partner is None or me["points"] > partner["points"]:
        return "me"
    if me["points"] < partner["points"]:
        return "partner"
    return "tie"


def _tally(couple: Couple, me: User, partner: User | None) -> dict[str, int]:
    rows = db.session.execute(
        select(WeeklyResult.winner_user_id, func.count())
        .where(WeeklyResult.couple_id == couple.id)
        .group_by(WeeklyResult.winner_user_id)
    )
    counts = {winner_user_id: count for winner_user_id, count in rows}
    return {
        "me_wins": counts.get(me.id, 0),
        "partner_wins": 0 if partner is None else counts.get(partner.id, 0),
        "ties": counts.get(None, 0),
    }


def _history_row(row: WeeklyResult, user_id: int) -> dict[str, Any]:
    if row.user_a_id == user_id:
        mine, theirs = row.user_a_points, row.user_b_points
    else:
        mine, theirs = row.user_b_points, row.user_a_points

    if row.winner_user_id is None:
        result = "tie"
    elif row.winner_user_id == user_id:
        result = "win"
    else:
        result = "loss"

    return {
        "week_start": row.week_start.isoformat(),
        "me_points": mine,
        "partner_points": theirs,
        "result": result,
    }
