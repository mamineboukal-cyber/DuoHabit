"""Unit tests for the shared timezone helper (PLAN section 10)."""

from __future__ import annotations

import pytest

from app.services.timeutil import validate_timezone


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
