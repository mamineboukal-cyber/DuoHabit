"""Couple model (PLAN section 6)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CHAR, BigInteger, DateTime, Identity, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db

if TYPE_CHECKING:
    from .user import User


class Couple(db.Model):
    __tablename__ = "couples"
    __table_args__ = (UniqueConstraint("invite_code", name="uq_couples_invite_code"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    invite_code: Mapped[str] = mapped_column(CHAR(8), nullable=False)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Africa/Casablanca'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    members: Mapped[list[User]] = relationship("User", back_populates="couple")
