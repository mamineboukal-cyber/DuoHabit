"""Unit tests for the shared timezone helper (PLAN section 10)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from freezegun import freeze_time

from app.services.timeutil import (
    today_in_tz,
    validate_timezone,
    week_end,
    week_start,
)


@pytest.mark.parametrize(
    "name",
    ["Africa/Casablanca", "Europe/Paris", "America/New_York", "UTC"],
)
def test_valid_iana_timezones_are_accepted(name: str) -> None:
    assert validate_timezone(f"  {name}  ") == name


@pytest.mark.parametrize(
    "name",
    [
        "",
        "   ",
        "Mars/Olympus",
        "Not/AZone",
        "Africa/Casablanca/Extra",
        "../../etc/passwd",
        "x" * 65,
    ],
)
def test_invalid_timezones_are_rejected(name: str) -> None:
    with pytest.raises(ValueError, match="valid IANA timezone"):
        validate_timezone(name)


@freeze_time("2026-10-25 23:30:00")
def test_today_in_tz_uses_the_requested_timezone() -> None:
    assert today_in_tz("UTC") == date(2026, 10, 25)
    assert today_in_tz("Asia/Tokyo") == date(2026, 10, 26)


def _local_instant(day: date, hour: int, minute: int = 0) -> datetime:
    """Return the UTC instant for a Casablanca wall-clock time (offset-agnostic)."""
    zone = ZoneInfo("Africa/Casablanca")
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=zone).astimezone(UTC)


@pytest.mark.parametrize(
    "day",
    [
        date(2026, 10, 19),  # Monday
        date(2026, 10, 20),
        date(2026, 10, 21),
        date(2026, 10, 22),
        date(2026, 10, 23),
        date(2026, 10, 24),
        date(2026, 10, 25),  # Sunday
    ],
)
def test_week_bounds_cover_monday_to_sunday(day: date) -> None:
    start = week_start(day)
    end = week_end(day)

    assert start == date(2026, 10, 19)
    assert start.weekday() == 0
    assert end.weekday() == 6
    assert (end - start).days == 6
    assert start <= day <= end


@pytest.mark.parametrize(
    "day",
    [
        date(2025, 12, 29),  # Monday
        date(2025, 12, 31),  # week crosses into the next year
        date(2026, 1, 1),
        date(2024, 2, 29),  # leap day
        date(2026, 12, 31),
    ],
)
def test_week_bounds_cross_month_and_year_edges(day: date) -> None:
    start = week_start(day)
    end = week_end(day)

    assert start.weekday() == 0
    assert end.weekday() == 6
    assert start <= day <= end
    assert (end - start).days == 6


@freeze_time(_local_instant(date(2026, 10, 25), 23, 30))
def test_sunday_2330_casablanca_still_belongs_to_the_current_week() -> None:
    today = today_in_tz("Africa/Casablanca")

    assert today == date(2026, 10, 25)
    assert week_start(today) == date(2026, 10, 19)
    assert week_end(today) == date(2026, 10, 25)


@freeze_time(_local_instant(date(2026, 10, 26), 0, 30))
def test_monday_0030_casablanca_starts_a_new_week() -> None:
    today = today_in_tz("Africa/Casablanca")

    assert today == date(2026, 10, 26)
    assert week_start(today) == date(2026, 10, 26)
    assert week_end(today) == date(2026, 11, 1)
