"""Request schemas and path parsing for check-ins (PLAN section 7)."""

from __future__ import annotations

import datetime
import re

from pydantic import BaseModel, ConfigDict

from ..errors import ApiError

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CreateCheckinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: datetime.date


def parse_checkin_date(value: str) -> datetime.date:
    """Parse a path date or raise the standard per-field 422."""
    if not _DATE_PATTERN.fullmatch(value):
        raise _invalid_date()

    try:
        return datetime.date.fromisoformat(value)
    except ValueError as exc:
        raise _invalid_date() from exc


def _invalid_date() -> ApiError:
    return ApiError(
        422,
        "validation_error",
        "Invalid request data.",
        {"date": "Date must be a valid date in YYYY-MM-DD format."},
    )
