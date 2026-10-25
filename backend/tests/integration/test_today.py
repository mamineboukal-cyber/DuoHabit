"""F8 and F6 display: the Today dashboard."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import pytest
from flask import Flask
from flask.testing import FlaskClient
from freezegun import freeze_time
from sqlalchemy import text
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


def _create_habit(client: FlaskClient, **overrides: object) -> int:
    response = client.post("/api/habits", json={"name": "Run", **overrides})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["habit"]["id"]


def _checkin(client: FlaskClient, habit_id: int, checkin_date: date | str):
    value = checkin_date.isoformat() if isinstance(checkin_date, date) else checkin_date
    return client.post(f"/api/habits/{habit_id}/checkins", json={"date": value})


def _today() -> date:
    return today_in_tz(DEFAULT_TIMEZONE)


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


def test_solo_couple_gets_partner_null_and_an_empty_progress(client: FlaskClient) -> None:
    user = _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = client.get("/api/today")

    assert response.status_code == 200
    body = response.get_json()
    assert body["date"] == _today().isoformat()
    assert body["timezone"] == DEFAULT_TIMEZONE
    assert body["partner"] is None

    me = body["me"]
    assert me["user"] == {"id": user["id"], "display_name": "Solo"}
    assert me["level"] == 1
    assert me["total_xp"] == 0
    assert me["xp_into_level"] == 0
    assert me["xp_for_next_level"] == 100
    assert me["today_points"] == 0
    assert me["habits"] == []


def test_scheduled_habits_show_points_previews_and_no_checkin_points(
    client: FlaskClient,
) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    easy_id = _create_habit(client, name="Walk")
    hard_id = _create_habit(client, name="Gym", emoji="🏋️", difficulty=3)

    habits = client.get("/api/today").get_json()["me"]["habits"]

    assert [row["habit"]["id"] for row in habits] == [easy_id, hard_id]
    easy, hard = habits
    assert easy["done"] is False
    assert easy["points_if_done"] == 10
    assert easy["checkin_points"] is None
    assert hard["done"] is False
    assert hard["points_if_done"] == 30
    assert hard["checkin_points"] is None
    assert hard["habit"]["emoji"] == "🏋️"
    # The row embeds the same habit object as GET /api/habits.
    assert [row["habit"] for row in habits] == client.get("/api/habits").get_json()["habits"]


def test_points_if_done_for_an_undone_habit_matches_a_real_checkin(
    client: FlaskClient,
) -> None:
    """The preview must equal the points the check-in endpoint then awards."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)
    today = _today()

    assert _checkin(client, habit_id, today - timedelta(days=1)).status_code == 201

    preview = client.get("/api/today").get_json()["me"]["habits"][0]
    assert preview["done"] is False
    assert preview["checkin_points"] is None
    assert preview["points_if_done"] == 11

    created = _checkin(client, habit_id, today)

    assert created.status_code == 201
    assert created.get_json()["checkin"]["points"] == preview["points_if_done"]

    after = client.get("/api/today").get_json()["me"]["habits"][0]
    assert after["done"] is True
    assert after["checkin_points"] == preview["points_if_done"]
    assert after["points_if_done"] == preview["points_if_done"]


def test_today_points_sum_checkins_and_archived_habits_stay_hidden(
    client: FlaskClient,
) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    today = _today()
    visible_id = _create_habit(client, name="Walk")
    archived_id = _create_habit(client, name="Old habit")

    assert _checkin(client, visible_id, today).status_code == 201
    assert _checkin(client, archived_id, today).status_code == 201
    assert client.delete(f"/api/habits/{archived_id}").status_code == 204

    me = client.get("/api/today").get_json()["me"]

    assert [row["habit"]["id"] for row in me["habits"]] == [visible_id]
    assert me["habits"][0]["done"] is True
    assert me["habits"][0]["checkin_points"] == 10
    # Archived habits still hold points, so today must match total XP (A15).
    assert me["today_points"] == 20
    assert me["total_xp"] == 20


def test_habit_not_scheduled_today_is_absent(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    tomorrow_weekday = (_today() + timedelta(days=1)).weekday()
    _create_habit(client, name="Tomorrow only", schedule_days=[tomorrow_weekday])

    me = client.get("/api/today").get_json()["me"]

    assert me["habits"] == []
    assert me["today_points"] == 0


def test_partner_block_is_read_only_and_separate(paired: PairedCouple) -> None:
    owner_habit_id = _create_habit(paired.owner_client, name="Owner run")
    partner_habit_id = _create_habit(
        paired.partner_client, name="Partner yoga", emoji="🧘", difficulty=2
    )
    today = _today()
    assert _checkin(paired.partner_client, partner_habit_id, today).status_code == 201

    body = paired.owner_client.get("/api/today").get_json()

    me = body["me"]
    assert [row["habit"]["id"] for row in me["habits"]] == [owner_habit_id]
    assert me["today_points"] == 0
    assert me["habits"][0]["done"] is False
    assert me["habits"][0]["checkin_points"] is None

    partner = body["partner"]
    assert partner is not None
    assert partner["user"] == {"id": paired.partner["id"], "display_name": "Partner"}
    assert "email" not in partner["user"]
    assert partner["level"] == 1
    assert partner["total_xp"] == 20
    assert partner["today_points"] == 20
    assert [row["habit"]["id"] for row in partner["habits"]] == [partner_habit_id]

    row = partner["habits"][0]
    assert row["habit"]["owner_id"] == paired.partner["id"]
    assert row["done"] is True
    assert row["checkin_points"] == 20
    assert row["points_if_done"] == 20


@pytest.mark.parametrize(
    ("total_xp", "expected"),
    [
        (399, (2, 299, 300)),
        (400, (3, 0, 500)),
    ],
)
def test_level_fields_follow_total_xp(
    client: FlaskClient,
    db_session: Session,
    total_xp: int,
    expected: tuple[int, int, int],
) -> None:
    user = _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client)

    db_session.execute(
        text(
            """
            INSERT INTO checkins
                (habit_id, user_id, checkin_date, points, streak_at_checkin)
            VALUES
                (:habit_id, :user_id, :checkin_date, :points, 1)
            """
        ),
        {
            "habit_id": habit_id,
            "user_id": user["id"],
            "checkin_date": _today() - timedelta(days=10),
            "points": total_xp,
        },
    )

    me = client.get("/api/today").get_json()["me"]

    level, xp_into_level, xp_for_next_level = expected
    assert me["total_xp"] == total_xp
    assert me["level"] == level
    assert me["xp_into_level"] == xp_into_level
    assert me["xp_for_next_level"] == xp_for_next_level
    assert me["today_points"] == 0
    assert me["habits"][0]["done"] is False


def test_today_requires_a_session_and_a_couple(client: FlaskClient) -> None:
    unauthenticated = client.get("/api/today")
    assert unauthenticated.status_code == 401
    assert unauthenticated.get_json()["error"]["code"] == "unauthenticated"

    _register(client, "solo@example.com", "Solo")

    no_couple = client.get("/api/today")
    assert no_couple.status_code == 409
    assert no_couple.get_json()["error"]["code"] == "no_couple"


def test_other_couple_habits_and_points_are_not_visible(
    client: FlaskClient,
    outsider: tuple[dict, FlaskClient],
) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    own_habit_id = _create_habit(client, name="Mine")

    _, outsider_client = outsider
    outsider_habit_id = _create_habit(outsider_client, name="Theirs")
    assert _checkin(outsider_client, outsider_habit_id, _today()).status_code == 201

    body = client.get("/api/today").get_json()

    assert [row["habit"]["id"] for row in body["me"]["habits"]] == [own_habit_id]
    assert body["me"]["today_points"] == 0
    assert body["partner"] is None


def test_today_date_query_keeps_the_no_parameter_response_identical(
    client: FlaskClient,
) -> None:
    """The date parameter only adds the streak preview; the normal payload is unchanged."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    _create_habit(client, name="Walk")

    no_parameter = client.get("/api/today")
    explicit_today = client.get(f"/api/today?date={_today().isoformat()}")

    assert explicit_today.status_code == 200
    plain_body = no_parameter.get_json()
    dated_body = explicit_today.get_json()
    assert "streak_if_done" not in plain_body["me"]["habits"][0]
    assert "streak_if_done" in dated_body["me"]["habits"][0]

    dated_without_preview = {
        **dated_body,
        "me": {
            **dated_body["me"],
            "habits": [
                {key: value for key, value in row.items() if key != "streak_if_done"}
                for row in dated_body["me"]["habits"]
            ],
        },
    }
    assert dated_without_preview == plain_body


def test_yesterday_query_returns_yesterday_habits_and_checkins(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client, name="Walk")
    yesterday = _today() - timedelta(days=1)
    assert _checkin(client, habit_id, yesterday).status_code == 201

    body = client.get(f"/api/today?date={yesterday.isoformat()}").get_json()

    assert body["date"] == yesterday.isoformat()
    me = body["me"]
    assert me["today_points"] == 10
    assert me["total_xp"] == 10
    row = me["habits"][0]
    assert row["habit"]["id"] == habit_id
    assert row["done"] is True
    assert row["checkin_points"] == 10
    assert row["points_if_done"] == 10
    assert row["streak_if_done"] == 1


def test_yesterday_points_if_done_matches_a_real_yesterday_checkin(
    client: FlaskClient,
) -> None:
    """The yesterday preview must equal the points and streak the API awards."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    habit_id = _create_habit(client, name="Walk")
    yesterday = _today() - timedelta(days=1)

    preview = client.get(f"/api/today?date={yesterday.isoformat()}").get_json()["me"]["habits"][0]
    assert preview["done"] is False
    assert preview["checkin_points"] is None

    created = _checkin(client, habit_id, yesterday)

    assert created.status_code == 201
    checkin = created.get_json()["checkin"]
    assert checkin["points"] == preview["points_if_done"]
    assert checkin["streak_at_checkin"] == preview["streak_if_done"]

    after = client.get(f"/api/today?date={yesterday.isoformat()}").get_json()["me"]["habits"][0]
    assert after["done"] is True
    assert after["checkin_points"] == preview["points_if_done"]


@pytest.mark.parametrize("value", ["not-a-date", "2026-13-01", "2026-02-30"])
def test_today_query_rejects_malformed_dates(client: FlaskClient, value: str) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = client.get(f"/api/today?date={value}")

    assert response.status_code == 422
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    assert "date" in error["details"]


@pytest.mark.parametrize("days", [-2, 1])
def test_today_query_rejects_dates_outside_the_window(client: FlaskClient, days: int) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    value = (_today() + timedelta(days=days)).isoformat()

    response = client.get(f"/api/today?date={value}")

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "date_out_of_range"


@freeze_time("2026-10-25 23:30:00")
def test_date_and_schedule_follow_the_couple_timezone(client: FlaskClient) -> None:
    """At 23:30 UTC it is already Monday in Tokyo, so Monday's habits show."""
    _register(client, "solo@example.com", "Solo")
    _create_couple(client, timezone="Asia/Tokyo")
    monday_id = _create_habit(client, name="Monday", schedule_days=[0])
    _create_habit(client, name="Sunday only", schedule_days=[6])

    body = client.get("/api/today").get_json()

    assert body["date"] == "2026-10-26"
    assert body["timezone"] == "Asia/Tokyo"
    assert [row["habit"]["id"] for row in body["me"]["habits"]] == [monday_id]
