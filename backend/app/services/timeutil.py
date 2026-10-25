"""Timezone helpers shared by couple, habit and week logic (PLAN section 10)."""

from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_MAX_TIMEZONE_LENGTH = 64


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
