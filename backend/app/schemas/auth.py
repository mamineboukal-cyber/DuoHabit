"""Request schemas for the auth endpoints (PLAN section 7)."""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not _EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Enter a valid email address.")
    return email


def _strip_whitespace(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


Email = Annotated[str, AfterValidator(_normalize_email)]
DisplayName = Annotated[str, BeforeValidator(_strip_whitespace), Field(min_length=1, max_length=40)]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterRequest(_StrictModel):
    email: Email
    # Passwords are intentionally not stripped; 10 chars minimum, 128 maximum.
    password: str = Field(min_length=10, max_length=128)
    display_name: DisplayName


class LoginRequest(_StrictModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class UpdateMeRequest(_StrictModel):
    display_name: DisplayName
