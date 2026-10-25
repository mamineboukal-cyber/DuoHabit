"""Unit tests for the shared timezone helper (PLAN section 10)."""

from __future__ import annotations

from datetime import date

import pytest
from freezegun import freeze_time

from app.services.timeutil import today_in_tz, validate_timezone


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
