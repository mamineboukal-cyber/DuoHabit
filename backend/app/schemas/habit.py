"""Request schemas for the habit endpoints (PLAN section 7)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _normalize_schedule_days(days: list[int]) -> list[int]:
    if any(day < 0 or day > 6 for day in days):
        raise ValueError("Schedule days must be between 0 and 6.")
    if len(set(days)) != len(days):
        raise ValueError("Schedule days must not contain duplicates.")
    return sorted(days)


class CreateHabitRequest(_StrictModel):
    name: str = Field(min_length=1, max_length=60)
    emoji: str | None = Field(default=None, max_length=8)
    difficulty: int = Field(default=1, ge=1, le=3)
    schedule_days: list[int] = Field(default_factory=lambda: list(range(7)), min_length=1)

    @field_validator("emoji")
    @classmethod
    def _blank_emoji_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("schedule_days")
    @classmethod
    def _check_schedule_days(cls, days: list[int]) -> list[int]:
        return _normalize_schedule_days(days)


class UpdateHabitRequest(_StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    emoji: str | None = Field(default=None, max_length=8)
    difficulty: int | None = Field(default=None, ge=1, le=3)
    schedule_days: list[int] | None = Field(default=None, min_length=1)

    @field_validator("emoji")
    @classmethod
    def _blank_emoji_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("schedule_days")
    @classmethod
    def _check_schedule_days(cls, days: list[int] | None) -> list[int] | None:
        return None if days is None else _normalize_schedule_days(days)


class HabitListQuery(_StrictModel):
    owner: Literal["me", "partner"] = "me"
    include_archived: bool = False
