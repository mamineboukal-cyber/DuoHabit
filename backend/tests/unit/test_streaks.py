"""Unit tests for the pure streak calculations (PLAN section 2, F5)."""

from __future__ import annotations

from datetime import date

from app.services.streaks import (
    best_streak,
    current_streak,
    longest_streak,
    streak_at_checkin,
)

MON = date(2026, 10, 19)
TUE = date(2026, 10, 20)
WED = date(2026, 10, 21)
THU = date(2026, 10, 22)
FRI = date(2026, 10, 23)
SAT = date(2026, 10, 24)
SUN = date(2026, 10, 25)
NEXT_MON = date(2026, 10, 26)

DAILY = [0, 1, 2, 3, 4, 5, 6]
MWF = [0, 2, 4]


def test_daily_habit_done_three_days_has_a_streak_of_three() -> None:
    dates = {MON, TUE, WED}

    assert streak_at_checkin(DAILY, dates, WED) == 3
    assert current_streak(DAILY, dates, WED) == 3
    assert longest_streak(DAILY, dates) == 3


def test_a_gap_resets_the_current_streak() -> None:
    dates = {MON, TUE, THU}

    assert streak_at_checkin(DAILY, dates, THU) == 1
    assert current_streak(DAILY, dates, THU) == 1
    assert longest_streak(DAILY, dates) == 2


def test_today_pending_does_not_reset_the_streak() -> None:
    dates = {MON, TUE}

    assert current_streak(DAILY, dates, WED) == 2


def test_streak_counts_only_the_run_since_the_last_missed_day() -> None:
    dates = {MON, TUE, THU, FRI}

    assert current_streak(DAILY, dates, FRI) == 2
    assert longest_streak(DAILY, dates) == 2


def test_mon_wed_fri_ignores_off_days() -> None:
    dates = {MON, WED, FRI}

    assert streak_at_checkin(MWF, dates, FRI) == 3
    assert current_streak(MWF, dates, FRI) == 3
    assert current_streak(MWF, dates, SAT) == 3
    assert longest_streak(MWF, dates) == 3


def test_pending_scheduled_today_uses_the_previous_scheduled_day() -> None:
    assert current_streak(MWF, {MON, WED}, FRI) == 2
    assert current_streak(MWF, {MON, WED, FRI}, NEXT_MON) == 3


def test_a_missed_scheduled_day_can_reset_to_zero() -> None:
    assert current_streak(MWF, {MON}, FRI) == 0


def test_no_checkins_means_no_streak() -> None:
    assert current_streak(DAILY, set(), WED) == 0
    assert longest_streak(DAILY, set()) == 0


def test_unscheduled_checkin_date_has_no_streak() -> None:
    assert streak_at_checkin(MWF, {TUE}, TUE) == 0


def test_best_streak_never_drops_below_the_stored_value() -> None:
    assert best_streak(DAILY, {MON, TUE}, 1) == 2
    assert best_streak(DAILY, {MON, TUE}, 5) == 5
    assert best_streak(DAILY, set(), 5) == 5


def test_sunday_is_not_treated_as_the_start_of_the_week() -> None:
    # The streak helper only cares about weekdays, not week boundaries.
    assert current_streak(DAILY, {SAT, SUN}, SUN) == 2
