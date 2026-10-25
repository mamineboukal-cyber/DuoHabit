"""F4/F5/F6 acceptance criteria: check-ins, streaks, XP and levels."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import pytest
from flask import Flask
from flask.testing import FlaskClient
from freezegun import freeze_time
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.services.timeutil import today_in_tz

PASSWORD = "correct-horse-battery"
DEFAULT_TIMEZONE = "Africa/Casablanca"


@dataclass
class PairedCouple:
    owner: dict
    owner_client: FlaskClient
    partner: dict
    partner_client: FlaskClient
    couple: dict


def _register(client: FlaskClient, email: str, display_name: str = "User") -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["user"]


def _create_couple(client: FlaskClient, **payload: object) -> dict:
    response = client.post("/api/couple", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["couple"]


def _join_couple(client: FlaskClient, invite_code: str) -> dict:
    response = client.post("/api/couple/join", json={"invite_code": invite_code})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["couple"]


@pytest.fixture()
def paired(app: Flask, client: FlaskClient) -> PairedCouple:
    owner = _register(client, "owner@example.com", "Owner")
    couple = _create_couple(client)

    partner_client = app.test_client()
    partner = _register(partner_client, "partner@example.com", "Partner")
    _join_couple(partner_client, couple["invite_code"])

    return PairedCouple(owner, client, partner, partner_client, couple)


@pytest.fixture()
def outsider(app: Flask) -> tuple[dict, FlaskClient]:
    client = app.test_client()
    user = _register(client, "outsider@example.com", "Outsider")
    _create_couple(client)
    return user, client


def _create_habit(client: FlaskClient, **overrides: object) -> int:
    response = client.post("/api/habits", json={"name": "Run", **overrides})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["habit"]["id"]


def _checkin(client: FlaskClient, habit_id: int, checkin_date: date | str):
    value = checkin_date.isoformat() if isinstance(checkin_date, date) else checkin_date
    return client.post(f"/api/habits/{habit_id}/checkins", json={"date": value})


def _undo(client: FlaskClient, habit_id: int, checkin_date: date | str):
    value = checkin_date.isoformat() if isinstance(checkin_date, date) else checkin_date
    return client.delete(f"/api/habits/{habit_id}/checkins/{value}")


def _today() -> date:
    return today_in_tz(DEFAULT_TIMEZONE)


def test_checkin_today_returns_points_streak_xp_and_level(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()

    response = _checkin(client, habit_id, today)

    assert response.status_code == 201
    body = response.get_json()
    assert body["checkin"]["habit_id"] == habit_id
    assert body["checkin"]["checkin_date"] == today.isoformat()
    assert body["checkin"]["points"] == 10
    assert body["checkin"]["streak_at_checkin"] == 1
    assert body["habit"]["current_streak"] == 1
    assert body["habit"]["best_streak"] == 1
    assert body["total_xp"] == 10
    assert body["level"] == 1


def test_yesterday_is_allowed_and_today_stays_pending(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()
    yesterday = today - timedelta(days=1)

    response = _checkin(client, habit_id, yesterday)

    assert response.status_code == 201
    body = response.get_json()
    assert body["checkin"]["points"] == 10
    assert body["checkin"]["streak_at_checkin"] == 1
    assert body["habit"]["current_streak"] == 1
    assert body["habit"]["best_streak"] == 1
    assert body["total_xp"] == 10


@freeze_time("2026-10-25 12:00:00")
def test_checking_in_today_then_yesterday_counts_only_up_to_yesterday(
    client: FlaskClient,
) -> None:
    """The stored streak for yesterday must not include today's check-in."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = date(2026, 10, 25)
    yesterday = date(2026, 10, 24)

    first = _checkin(client, habit_id, today)
    assert first.status_code == 201
    assert first.get_json()["checkin"]["streak_at_checkin"] == 1

    second = _checkin(client, habit_id, yesterday)

    assert second.status_code == 201
    body = second.get_json()
    assert body["checkin"]["streak_at_checkin"] == 1
    assert body["checkin"]["points"] == 10
    assert body["habit"]["current_streak"] == 2
    assert body["habit"]["best_streak"] == 2


def test_multiplier_applies_when_yesterday_and_today_are_done(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()
    yesterday = today - timedelta(days=1)

    assert _checkin(client, habit_id, yesterday).status_code == 201
    response = _checkin(client, habit_id, today)

    assert response.status_code == 201
    body = response.get_json()
    assert body["checkin"]["streak_at_checkin"] == 2
    assert body["checkin"]["points"] == 11
    assert body["habit"]["current_streak"] == 2
    assert body["total_xp"] == 21


@pytest.mark.parametrize("days_ago", [2, 3, 30])
def test_older_dates_are_rejected(client: FlaskClient, days_ago: int) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    response = _checkin(client, habit_id, _today() - timedelta(days=days_ago))

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "date_out_of_range"


def test_future_dates_are_rejected(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    response = _checkin(client, habit_id, _today() + timedelta(days=1))

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "date_out_of_range"


def test_unscheduled_dates_are_rejected(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    today = _today()
    habit_id = _create_habit(client, schedule_days=[today.weekday()])

    response = _checkin(client, habit_id, today - timedelta(days=1))

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "not_scheduled"


def test_duplicate_checkin_returns_409(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()

    assert _checkin(client, habit_id, today).status_code == 201
    response = _checkin(client, habit_id, today)

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "already_checked_in"


def test_partner_cannot_check_in_or_undo(paired: PairedCouple) -> None:
    habit_id = _create_habit(paired.owner_client)
    today = _today()

    checkin = _checkin(paired.partner_client, habit_id, today)
    assert checkin.status_code == 403
    assert checkin.get_json()["error"]["code"] == "forbidden"

    undo = _undo(paired.partner_client, habit_id, today)
    assert undo.status_code == 403
    assert undo.get_json()["error"]["code"] == "forbidden"


def test_other_couple_gets_404(
    paired: PairedCouple,
    outsider: tuple[dict, FlaskClient],
) -> None:
    habit_id = _create_habit(paired.owner_client)
    today = _today()
    _, outsider_client = outsider

    checkin = _checkin(outsider_client, habit_id, today)
    assert checkin.status_code == 404
    assert checkin.get_json()["error"]["code"] == "not_found"

    undo = _undo(outsider_client, habit_id, today)
    assert undo.status_code == 404
    assert undo.get_json()["error"]["code"] == "not_found"


def test_archived_habit_cannot_be_checked_in(paired: PairedCouple) -> None:
    habit_id = _create_habit(paired.owner_client)
    assert paired.owner_client.delete(f"/api/habits/{habit_id}").status_code == 204

    response = _checkin(paired.owner_client, habit_id, _today())

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "habit_archived"


def test_owner_can_undo_a_checkin_after_archiving(paired: PairedCouple) -> None:
    habit_id = _create_habit(paired.owner_client)
    today = _today()
    assert _checkin(paired.owner_client, habit_id, today).status_code == 201
    assert paired.owner_client.delete(f"/api/habits/{habit_id}").status_code == 204

    response = _undo(paired.owner_client, habit_id, today)

    assert response.status_code == 200
    body = response.get_json()
    assert body["habit"]["archived_at"] is not None
    assert body["habit"]["current_streak"] == 0
    assert body["habit"]["best_streak"] == 1
    assert body["total_xp"] == 0
    assert body["level"] == 1


def test_total_xp_includes_checkins_from_archived_habits(paired: PairedCouple) -> None:
    today = _today()
    first_id = _create_habit(paired.owner_client, name="Hard one", difficulty=3)
    assert _checkin(paired.owner_client, first_id, today).status_code == 201
    assert paired.owner_client.delete(f"/api/habits/{first_id}").status_code == 204

    second_id = _create_habit(paired.owner_client, name="Hard two", difficulty=3)
    response = _checkin(paired.owner_client, second_id, today)

    assert response.status_code == 201
    assert response.get_json()["total_xp"] == 60


def test_undo_removes_points_and_recomputes_streaks(paired: PairedCouple) -> None:
    habit_id = _create_habit(paired.owner_client)
    today = _today()
    yesterday = today - timedelta(days=1)

    assert _checkin(paired.owner_client, habit_id, yesterday).status_code == 201
    today_response = _checkin(paired.owner_client, habit_id, today)
    assert today_response.status_code == 201
    assert today_response.get_json()["total_xp"] == 21

    undo_today = _undo(paired.owner_client, habit_id, today)
    assert undo_today.status_code == 200
    body = undo_today.get_json()
    assert body["total_xp"] == 10
    assert body["level"] == 1
    assert body["habit"]["current_streak"] == 1
    assert body["habit"]["best_streak"] == 2

    undo_yesterday = _undo(paired.owner_client, habit_id, yesterday)
    assert undo_yesterday.status_code == 200
    body = undo_yesterday.get_json()
    assert body["total_xp"] == 0
    assert body["habit"]["current_streak"] == 0
    assert body["habit"]["best_streak"] == 2

    missing = _undo(paired.owner_client, habit_id, today)
    assert missing.status_code == 404
    assert missing.get_json()["error"]["code"] == "not_found"


def test_undo_older_than_yesterday_is_rejected(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    response = _undo(client, habit_id, _today() - timedelta(days=2))

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "date_out_of_range"


def test_level_tracks_total_xp_and_undo_lowers_it(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    today = _today()
    habit_ids = [_create_habit(client, name=f"Hard {index}", difficulty=3) for index in range(4)]

    responses = [_checkin(client, habit_id, today) for habit_id in habit_ids]

    assert [response.status_code for response in responses] == [201, 201, 201, 201]
    assert responses[-1].get_json()["total_xp"] == 120
    assert responses[-1].get_json()["level"] == 2

    undo = _undo(client, habit_ids[-1], today)
    assert undo.status_code == 200
    assert undo.get_json()["total_xp"] == 90
    assert undo.get_json()["level"] == 1


def test_malformed_body_date_returns_validation_error(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    response = client.post(
        f"/api/habits/{habit_id}/checkins",
        json={"date": "2026-02-30"},
    )

    assert response.status_code == 422
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    assert "date" in error["details"]


def test_malformed_path_date_returns_validation_error(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    response = _undo(client, habit_id, "not-a-date")

    assert response.status_code == 422
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    assert "date" in error["details"]


def test_missing_habit_returns_404(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    today = _today()

    checkin = _checkin(client, 999999, today)
    assert checkin.status_code == 404
    assert checkin.get_json()["error"]["code"] == "not_found"

    undo = _undo(client, 999999, today)
    assert undo.status_code == 404
    assert undo.get_json()["error"]["code"] == "not_found"


@freeze_time("2026-10-25 23:30:00")
def test_date_window_follows_the_couple_timezone(client: FlaskClient) -> None:
    """At 23:30 UTC it is already the next day in Tokyo."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client, timezone="Asia/Tokyo")
    habit_id = _create_habit(client)

    assert today_in_tz("UTC") == date(2026, 10, 25)
    assert today_in_tz("Asia/Tokyo") == date(2026, 10, 26)

    assert _checkin(client, habit_id, "2026-10-26").status_code == 201
    assert _checkin(client, habit_id, "2026-10-25").status_code == 201

    older = _checkin(client, habit_id, "2026-10-24")
    assert older.status_code == 422
    assert older.get_json()["error"]["code"] == "date_out_of_range"

    future = _checkin(client, habit_id, "2026-10-27")
    assert future.status_code == 422
    assert future.get_json()["error"]["code"] == "date_out_of_range"


def test_database_rejects_duplicate_checkin_dates(
    client: FlaskClient,
    db_session: Session,
) -> None:
    """Prove the unique constraint independently of the service pre-check."""
    user = _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()

    insert = text(
        """
        INSERT INTO checkins
            (habit_id, user_id, checkin_date, points, streak_at_checkin)
        VALUES
            (:habit_id, :user_id, :checkin_date, 10, 1)
        """
    )
    params = {
        "habit_id": habit_id,
        "user_id": user["id"],
        "checkin_date": today,
    }
    db_session.execute(insert, params)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.execute(insert, params)

    assert exc_info.value.orig.diag.constraint_name == "uq_checkins_habit_id_checkin_date"
    db_session.rollback()
