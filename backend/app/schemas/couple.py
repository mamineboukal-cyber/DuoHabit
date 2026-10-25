"""Request schemas for the couple endpoints (PLAN section 7)."""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, field_validator

from ..services.timeutil import validate_timezone

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_INVITE_PATTERN = re.compile(rf"^[{INVITE_ALPHABET}]{{8}}$")


def _normalize_invite_code(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


def _check_invite_code(value: str) -> str:
    if not _INVITE_PATTERN.fullmatch(value):
        raise ValueError("Enter a valid invite code.")
    return value


InviteCode = Annotated[
    str,
    BeforeValidator(_normalize_invite_code),
    AfterValidator(_check_invite_code),
]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateCoupleRequest(_StrictModel):
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        return None if value is None else validate_timezone(value)


class JoinCoupleRequest(_StrictModel):
    invite_code: InviteCode


class UpdateCoupleRequest(_StrictModel):
    timezone: str

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        return validate_timezone(value)
