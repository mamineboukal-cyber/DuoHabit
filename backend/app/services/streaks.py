"""Pure streak calculations (PLAN section 2)."""

from __future__ import annotations

from collections.abc import Collection, Sequence
from datetime import date, timedelta


def streak_at_checkin(
    schedule_days: Sequence[int],
    checkin_dates: Collection[date],
    checkin_date: date,
) -> int:
    """Count consecutive scheduled check-ins ending on ``checkin_date``."""
    if not _is_scheduled(schedule_days, checkin_date):
        return 0
    return _consecutive_done_ending_on(schedule_days, checkin_dates, checkin_date)


def current_streak(
    schedule_days: Sequence[int],
    checkin_dates: Collection[date],
    today: date,
) -> int:
    """Return the habit's current streak, treating today as pending when needed."""
    start = _latest_scheduled_on_or_before(schedule_days, today)
    if start is None:
        return 0

    if start == today and today not in checkin_dates:
        start = _latest_scheduled_on_or_before(schedule_days, today - timedelta(days=1))
        if start is None:
            return 0

    return _consecutive_done_ending_on(schedule_days, checkin_dates, start)


def longest_streak(
    schedule_days: Sequence[int],
    checkin_dates: Collection[date],
) -> int:
    """Return the longest consecutive scheduled-day run in history."""
    dates = set(checkin_dates)
    return max(
        (
            _consecutive_done_ending_on(schedule_days, dates, checkin_date)
            for checkin_date in dates
            if _is_scheduled(schedule_days, checkin_date)
        ),
        default=0,
    )


def best_streak(
    schedule_days: Sequence[int],
    checkin_dates: Collection[date],
    stored_best: int,
) -> int:
    """Return the best streak, never decreasing below the stored value."""
    return max(stored_best, longest_streak(schedule_days, checkin_dates))


def _is_scheduled(schedule_days: Sequence[int], day: date) -> bool:
    return day.weekday() in schedule_days


def _latest_scheduled_on_or_before(
    schedule_days: Sequence[int],
    day: date,
) -> date | None:
    for days_back in range(7):
        candidate = day - timedelta(days=days_back)
        if _is_scheduled(schedule_days, candidate):
            return candidate
    return None


def _consecutive_done_ending_on(
    schedule_days: Sequence[int],
    checkin_dates: Collection[date],
    end_date: date,
) -> int:
    count = 0
    day = end_date

    while True:
        if _is_scheduled(schedule_days, day):
            if day not in checkin_dates:
                break
            count += 1

        if day == date.min:
            break
        day -= timedelta(days=1)

    return count
