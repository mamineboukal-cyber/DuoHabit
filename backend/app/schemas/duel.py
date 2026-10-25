"""Request schemas for the duel endpoints (PLAN section 7)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DuelHistoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=12, ge=1, le=52)
