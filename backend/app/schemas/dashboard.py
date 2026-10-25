"""Query schemas for the Today dashboard (PLAN section 7)."""

from __future__ import annotations

import datetime

from pydantic import BaseModel, ConfigDict


class TodayQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: datetime.date | None = None
