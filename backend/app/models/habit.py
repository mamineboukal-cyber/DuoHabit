"""Habit model (PLAN section 6)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..extensions import db


class Habit(db.Model):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint("length(name) >= 1", name="ck_habits_name_length"),
        CheckConstraint("difficulty BETWEEN 1 AND 3", name="ck_habits_difficulty"),
        CheckConstraint(
            "cardinality(schedule_days) >= 1",
            name="ck_habits_schedule_days_nonempty",
        ),
        CheckConstraint(
            "schedule_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]",
            name="ck_habits_schedule_days_range",
        ),
        CheckConstraint("current_streak >= 0", name="ck_habits_current_streak"),
        CheckConstraint("best_streak >= 0", name="ck_habits_best_streak"),
        Index("ix_habits_owner_id_archived_at", "owner_id", "archived_at"),
        Index("ix_habits_couple_id", "couple_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    couple_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("couples.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(8), nullable=True)
    difficulty: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))
    schedule_days: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger),
        nullable=False,
        server_default=text("'{0,1,2,3,4,5,6}'::smallint[]"),
    )
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# Active habits of one owner cannot share a name, ignoring case. The partial
# predicate lets an archived habit's name be reused.
Index(
    "uq_habits_owner_name_active",
    Habit.owner_id,
    func.lower(Habit.name),
    unique=True,
    postgresql_where=Habit.archived_at.is_(None),
)
