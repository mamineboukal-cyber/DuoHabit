"""Timezone helpers shared by couple, habit and week logic (PLAN section 10)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_MAX_TIMEZONE_LENGTH = 64


def today_in_tz(timezone: str) -> date:
    """Return the current calendar date in ``timezone``."""
    return datetime.now(ZoneInfo(timezone)).date()


def week_start(day: date) -> date:
    """Return the Monday of the week containing ``day``."""
    return day - timedelta(days=day.weekday())


def week_end(day: date) -> date:
    """Return the Sunday of the week containing ``day``."""
    return week_start(day) + timedelta(days=6)


def validate_timezone(name: str) -> str:
    """Return the trimmed IANA timezone name or raise ``ValueError``."""
    candidate = name.strip()

    if not candidate or len(candidate) > _MAX_TIMEZONE_LENGTH:
        raise ValueError("Enter a valid IANA timezone.")

    try:
        ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise ValueError("Enter a valid IANA timezone.") from exc

    return candidate
