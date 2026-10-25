"""Weekly duel result model (PLAN section 6)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db


class WeeklyResult(db.Model):
    __tablename__ = "weekly_results"
    __table_args__ = (
        UniqueConstraint(
            "couple_id",
            "week_start",
            name="uq_weekly_results_couple_id_week_start",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    couple_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("couples.id", ondelete="CASCADE"),
        nullable=False,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    # Convention (not a DB constraint): user_a_id is the lower user id.
    user_a_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )
    user_a_points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    user_b_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )
    user_b_points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # NULL means the week was a tie.
    winner_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=True,
    )
    finalized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
