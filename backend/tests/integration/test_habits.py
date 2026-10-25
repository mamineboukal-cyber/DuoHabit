"""F3 acceptance criteria: habit CRUD, uniqueness, archive and authorization."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Habit

PASSWORD = "correct-horse-battery"


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


def _create_couple(client: FlaskClient) -> dict:
    response = client.post("/api/couple", json={})
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


def _create_habit(client: FlaskClient, **overrides: object):
    return client.post("/api/habits", json={"name": "Run", **overrides})


def _habit_id(client: FlaskClient, **overrides: object) -> int:
    response = _create_habit(client, **overrides)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["habit"]["id"]


def _names(client: FlaskClient, query: str = "") -> list[str]:
    response = client.get(f"/api/habits{query}")
    assert response.status_code == 200, response.get_json()
    return [habit["name"] for habit in response.get_json()["habits"]]


def test_create_habit_returns_defaults(client: FlaskClient) -> None:
    user = _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = _create_habit(client, name="Read")

    assert response.status_code == 201
    habit = response.get_json()["habit"]
    assert habit["owner_id"] == user["id"]
    assert habit["name"] == "Read"
    assert habit["emoji"] is None
    assert habit["difficulty"] == 1
    assert habit["schedule_days"] == [0, 1, 2, 3, 4, 5, 6]
    assert habit["current_streak"] == 0
    assert habit["best_streak"] == 0
    assert habit["archived_at"] is None
    assert habit["created_at"].endswith("+00:00")


def test_create_habit_accepts_custom_values(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = _create_habit(
        client,
        name="Run",
        emoji="🏃",
        difficulty=3,
        schedule_days=[5, 1, 3],
    )

    assert response.status_code == 201
    habit = response.get_json()["habit"]
    assert habit["emoji"] == "🏃"
    assert habit["difficulty"] == 3
    assert habit["schedule_days"] == [1, 3, 5]


def test_create_habit_trims_name_and_blank_emoji(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = _create_habit(client, name="  Read  ", emoji="   ")

    assert response.status_code == 201
    habit = response.get_json()["habit"]
    assert habit["name"] == "Read"
    assert habit["emoji"] is None


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"name": ""}, "name"),
        ({"name": "x" * 61}, "name"),
        ({"difficulty": 0}, "difficulty"),
        ({"difficulty": 4}, "difficulty"),
        ({"schedule_days": []}, "schedule_days"),
        ({"schedule_days": [-1]}, "schedule_days"),
        ({"schedule_days": [7]}, "schedule_days"),
        ({"schedule_days": [1, 1]}, "schedule_days"),
        ({"emoji": "x" * 9}, "emoji"),
        ({"unexpected": True}, "unexpected"),
    ],
)
def test_create_habit_validation_errors(client: FlaskClient, overrides: dict, field: str) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = client.post("/api/habits", json={"name": "Run", **overrides})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "validation_error"
    assert field in response.get_json()["error"]["details"]


def test_active_habit_names_are_unique_case_insensitively(
    client: FlaskClient,
) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)
    assert _create_habit(client, name="Run").status_code == 201

    duplicate = _create_habit(client, name="  run  ")

    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"]["code"] == "habit_name_taken"


def test_same_name_allowed_for_partner_and_after_archive(
    paired: PairedCouple,
) -> None:
    assert _create_habit(paired.owner_client, name="Run").status_code == 201

    partner_habit = _create_habit(paired.partner_client, name="Run")
    assert partner_habit.status_code == 201

    habit_id = _habit_id(paired.owner_client, name="Read")
    assert paired.owner_client.delete(f"/api/habits/{habit_id}").status_code == 204

    reused = _create_habit(paired.owner_client, name="Read")
    assert reused.status_code == 201


def test_partner_can_read_but_cannot_write(paired: PairedCouple) -> None:
    habit_id = _habit_id(paired.owner_client, name="Run")

    partner_view = paired.partner_client.get("/api/habits?owner=partner")
    assert partner_view.status_code == 200
    assert [habit["id"] for habit in partner_view.get_json()["habits"]] == [habit_id]
    assert _names(paired.partner_client) == []

    patch = paired.partner_client.patch(f"/api/habits/{habit_id}", json={"name": "Hacked"})
    assert patch.status_code == 403
    assert patch.get_json()["error"]["code"] == "forbidden"

    delete = paired.partner_client.delete(f"/api/habits/{habit_id}")
    assert delete.status_code == 403
    assert delete.get_json()["error"]["code"] == "forbidden"

    assert _names(paired.owner_client) == ["Run"]


def test_other_couple_gets_404(paired: PairedCouple, outsider: tuple[dict, FlaskClient]) -> None:
    habit_id = _habit_id(paired.owner_client, name="Run")
    _, outsider_client = outsider

    patch = outsider_client.patch(f"/api/habits/{habit_id}", json={"name": "Hijacked"})
    assert patch.status_code == 404
    assert patch.get_json()["error"]["code"] == "not_found"

    delete = outsider_client.delete(f"/api/habits/{habit_id}")
    assert delete.status_code == 404
    assert delete.get_json()["error"]["code"] == "not_found"

    assert _names(paired.owner_client) == ["Run"]
    assert _names(outsider_client) == []


def test_list_defaults_to_own_active_habits(paired: PairedCouple) -> None:
    _habit_id(paired.owner_client, name="Run")
    _habit_id(paired.owner_client, name="Read")
    archived_id = _habit_id(paired.owner_client, name="Stretch")
    assert paired.owner_client.delete(f"/api/habits/{archived_id}").status_code == 204

    _habit_id(paired.partner_client, name="Meditate")

    assert _names(paired.owner_client) == ["Run", "Read"]

    with_archived = paired.owner_client.get("/api/habits?include_archived=true")
    assert [habit["name"] for habit in with_archived.get_json()["habits"]] == [
        "Run",
        "Read",
        "Stretch",
    ]
    archived = with_archived.get_json()["habits"][2]
    assert archived["archived_at"] is not None

    assert _names(paired.partner_client, "?owner=partner") == ["Run", "Read"]
    assert _names(paired.partner_client) == ["Meditate"]


def test_list_is_ordered_by_creation(paired: PairedCouple) -> None:
    _habit_id(paired.owner_client, name="First")
    _habit_id(paired.owner_client, name="Second")
    _habit_id(paired.owner_client, name="Third")
    second_id = paired.owner_client.get("/api/habits").get_json()["habits"][1]["id"]
    assert paired.owner_client.delete(f"/api/habits/{second_id}").status_code == 204

    assert _names(paired.owner_client) == ["First", "Third"]
    assert _names(paired.owner_client, "?include_archived=true") == [
        "First",
        "Second",
        "Third",
    ]


def test_partner_view_is_empty_without_a_partner(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = client.get("/api/habits?owner=partner")

    assert response.status_code == 200
    assert response.get_json() == {"habits": []}


def test_list_and_create_require_a_couple(client: FlaskClient) -> None:
    _register(client, "solo@example.com", "Solo")

    listed = client.get("/api/habits")
    assert listed.status_code == 409
    assert listed.get_json()["error"]["code"] == "no_couple"

    created = _create_habit(client, name="Run")
    assert created.status_code == 409
    assert created.get_json()["error"]["code"] == "no_couple"


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ("?owner=everyone", "owner"),
        ("?include_archived=maybe", "include_archived"),
        ("?unexpected=1", "unexpected"),
    ],
)
def test_list_query_validation(client: FlaskClient, query: str, field: str) -> None:
    _register(client, "solo@example.com", "Solo")
    _create_couple(client)

    response = client.get(f"/api/habits{query}")

    assert response.status_code == 422
    assert field in response.get_json()["error"]["details"]


def test_patch_updates_only_the_given_fields(paired: PairedCouple) -> None:
    habit_id = _habit_id(
        paired.owner_client,
        name="Run",
        emoji="🏃",
        difficulty=1,
        schedule_days=[0, 1, 2],
    )

    response = paired.owner_client.patch(
        f"/api/habits/{habit_id}",
        json={
            "name": "Sprint",
            "difficulty": 3,
            "schedule_days": [1, 3],
            "emoji": None,
        },
    )

    assert response.status_code == 200
    habit = response.get_json()["habit"]
    assert habit["name"] == "Sprint"
    assert habit["difficulty"] == 3
    assert habit["schedule_days"] == [1, 3]
    assert habit["emoji"] is None
    assert habit["id"] == habit_id


def test_patch_name_conflict_is_rejected(paired: PairedCouple) -> None:
    _habit_id(paired.owner_client, name="Run")
    read_id = _habit_id(paired.owner_client, name="Read")

    response = paired.owner_client.patch(f"/api/habits/{read_id}", json={"name": "run"})

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "habit_name_taken"


@pytest.mark.parametrize("field", ["name", "difficulty", "schedule_days"])
def test_patch_rejects_explicit_null(paired: PairedCouple, field: str) -> None:
    habit_id = _habit_id(paired.owner_client, name="Run")

    response = paired.owner_client.patch(f"/api/habits/{habit_id}", json={field: None})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "validation_error"
    assert field in response.get_json()["error"]["details"]


def test_patch_empty_body_is_a_noop(paired: PairedCouple) -> None:
    habit_id = _habit_id(paired.owner_client, name="Run")

    response = paired.owner_client.patch(f"/api/habits/{habit_id}", json={})

    assert response.status_code == 200
    assert response.get_json()["habit"]["name"] == "Run"


def test_patch_nonexistent_habit_returns_404(paired: PairedCouple) -> None:
    response = paired.owner_client.patch("/api/habits/999999", json={"name": "Ghost"})

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_archive_hides_the_habit_but_keeps_the_row(
    paired: PairedCouple, db_session: Session
) -> None:
    habit_id = _habit_id(paired.owner_client, name="Run")

    response = paired.owner_client.delete(f"/api/habits/{habit_id}")
    assert response.status_code == 204

    assert _names(paired.owner_client) == []
    archived_view = paired.owner_client.get("/api/habits?include_archived=true")
    archived = archived_view.get_json()["habits"][0]
    assert archived["id"] == habit_id
    assert archived["archived_at"] is not None

    row = db_session.get(Habit, habit_id)
    assert row is not None
    assert row.archived_at is not None

    again = paired.owner_client.delete(f"/api/habits/{habit_id}")
    assert again.status_code == 404

    patch = paired.owner_client.patch(f"/api/habits/{habit_id}", json={"name": "Revived"})
    assert patch.status_code == 404


def test_delete_nonexistent_habit_returns_404(paired: PairedCouple) -> None:
    response = paired.owner_client.delete("/api/habits/999999")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_partial_unique_index_rejects_case_variants(
    client: FlaskClient, db_session: Session
) -> None:
    """Prove the DB index, independently of the service pre-check."""
    user = _register(client, "solo@example.com", "Solo")
    couple = _create_couple(client)

    insert = text(
        "INSERT INTO habits (owner_id, couple_id, name) VALUES (:owner_id, :couple_id, :name)"
    )
    db_session.execute(
        insert,
        {"owner_id": user["id"], "couple_id": couple["id"], "name": "Run"},
    )

    with pytest.raises(IntegrityError) as exc_info:
        db_session.execute(
            insert,
            {"owner_id": user["id"], "couple_id": couple["id"], "name": "run"},
        )

    assert exc_info.value.orig.diag.constraint_name == "uq_habits_owner_name_active"
    db_session.rollback()
