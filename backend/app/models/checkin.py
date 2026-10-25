"""Check-in model (PLAN section 6)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db


class Checkin(db.Model):
    __tablename__ = "checkins"
    __table_args__ = (
        UniqueConstraint(
            "habit_id",
            "checkin_date",
            name="uq_checkins_habit_id_checkin_date",
        ),
        CheckConstraint("points > 0", name="ck_checkins_points_positive"),
        CheckConstraint(
            "streak_at_checkin >= 1",
            name="ck_checkins_streak_positive",
        ),
        Index("ix_checkins_user_id_checkin_date", "user_id", "checkin_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    habit_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("habits.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    streak_at_checkin: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
