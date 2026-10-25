"""F2 acceptance criteria: couple pairing, timezone and isolation."""

from __future__ import annotations

import threading
import uuid
from datetime import datetime

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import delete, func, select

from app.errors import ApiError
from app.extensions import db
from app.models import Couple, User
from app.services import couple_service
from app.services.couple_service import INVITE_ALPHABET

PASSWORD = "correct-horse-battery"
DEFAULT_TIMEZONE = "Africa/Casablanca"


def _register(
    client: FlaskClient,
    email: str = "alice@example.com",
    display_name: str = "Alice",
) -> dict:
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


def _join(client: FlaskClient, invite_code: str):
    return client.post("/api/couple/join", json={"invite_code": invite_code})


def test_create_couple_returns_an_invite_code(client: FlaskClient) -> None:
    user = _register(client)

    response = client.post("/api/couple", json={})

    assert response.status_code == 201
    couple = response.get_json()["couple"]
    assert len(couple["invite_code"]) == 8
    assert set(couple["invite_code"]) <= set(INVITE_ALPHABET)
    assert couple["timezone"] == DEFAULT_TIMEZONE
    assert couple["members"] == [{"id": user["id"], "display_name": "Alice"}]
    assert datetime.fromisoformat(couple["created_at"]).utcoffset().total_seconds() == 0

    me = client.get("/api/auth/me").get_json()["user"]
    assert me["couple_id"] == couple["id"]


def test_create_couple_accepts_an_absent_body(client: FlaskClient) -> None:
    _register(client)

    response = client.post("/api/couple")

    assert response.status_code == 201
    assert response.get_json()["couple"]["timezone"] == DEFAULT_TIMEZONE


def test_create_couple_accepts_an_explicit_timezone(client: FlaskClient) -> None:
    _register(client)

    couple = _create_couple(client, timezone="Europe/Paris")

    assert couple["timezone"] == "Europe/Paris"


def test_create_couple_twice_returns_already_in_couple(client: FlaskClient) -> None:
    _register(client)
    _create_couple(client)

    response = client.post("/api/couple", json={})

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "already_in_couple"


def test_create_couple_rejects_an_invalid_timezone(client: FlaskClient) -> None:
    _register(client)

    response = client.post("/api/couple", json={"timezone": "Mars/Olympus"})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "validation_error"
    assert "timezone" in response.get_json()["error"]["details"]


def test_create_couple_rejects_malformed_json(client: FlaskClient) -> None:
    _register(client)

    response = client.post(
        "/api/couple",
        data="{not valid json",
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "bad_json"


def test_join_couple_attaches_the_second_member(app: Flask, client: FlaskClient) -> None:
    owner = _register(client, "owner@example.com", "Owner")
    couple = _create_couple(client)

    partner_client = app.test_client()
    partner = _register(partner_client, "partner@example.com", "Partner")

    response = _join(partner_client, f"  {couple['invite_code'].lower()}  ")

    assert response.status_code == 200
    joined = response.get_json()["couple"]
    assert joined["id"] == couple["id"]
    assert joined["invite_code"] is None
    assert [member["id"] for member in joined["members"]] == [owner["id"], partner["id"]]

    partner_me = partner_client.get("/api/auth/me").get_json()["user"]
    assert partner_me["couple_id"] == couple["id"]

    owner_view = client.get("/api/couple").get_json()["couple"]
    assert owner_view["invite_code"] is None
    assert len(owner_view["members"]) == 2


def test_join_unknown_code_returns_invalid_code(app: Flask, client: FlaskClient) -> None:
    _register(client)

    response = _join(client, "AAAAAAAA")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "invalid_code"


def test_join_malformed_code_returns_validation_error(client: FlaskClient) -> None:
    _register(client)

    short = _join(client, "short")
    assert short.status_code == 422
    assert "invite_code" in short.get_json()["error"]["details"]

    ambiguous = _join(client, "IIIIIIII")  # I is not in the alphabet
    assert ambiguous.status_code == 422
    assert "invite_code" in ambiguous.get_json()["error"]["details"]


def test_join_full_couple_returns_couple_full(app: Flask, client: FlaskClient) -> None:
    _register(client, "owner@example.com", "Owner")
    couple = _create_couple(client)

    partner_client = app.test_client()
    _register(partner_client, "partner@example.com", "Partner")
    assert _join(partner_client, couple["invite_code"]).status_code == 200

    third_client = app.test_client()
    _register(third_client, "third@example.com", "Third")
    response = _join(third_client, couple["invite_code"])

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "couple_full"


def test_join_when_already_in_a_couple_takes_precedence(client: FlaskClient) -> None:
    _register(client)
    _create_couple(client)

    response = _join(client, "AAAAAAAA")

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "already_in_couple"


def test_get_couple_requires_a_couple(client: FlaskClient) -> None:
    _register(client)

    response = client.get("/api/couple")

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "no_couple"


def test_patch_couple_requires_a_couple(client: FlaskClient) -> None:
    _register(client)

    response = client.patch("/api/couple", json={"timezone": "Europe/Paris"})

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "no_couple"


def test_either_member_can_change_the_timezone(app: Flask, client: FlaskClient) -> None:
    _register(client, "owner@example.com", "Owner")
    couple = _create_couple(client)

    partner_client = app.test_client()
    _register(partner_client, "partner@example.com", "Partner")
    assert _join(partner_client, couple["invite_code"]).status_code == 200

    partner_patch = partner_client.patch("/api/couple", json={"timezone": "America/New_York"})
    assert partner_patch.status_code == 200
    assert partner_patch.get_json()["couple"]["timezone"] == "America/New_York"
    assert client.get("/api/couple").get_json()["couple"]["timezone"] == "America/New_York"

    owner_patch = client.patch("/api/couple", json={"timezone": "Europe/Paris"})
    assert owner_patch.status_code == 200
    assert partner_client.get("/api/couple").get_json()["couple"]["timezone"] == "Europe/Paris"


def test_patch_couple_rejects_an_invalid_timezone(client: FlaskClient) -> None:
    _register(client)
    _create_couple(client)

    response = client.patch("/api/couple", json={"timezone": "Not/AZone"})

    assert response.status_code == 422
    assert "timezone" in response.get_json()["error"]["details"]


def test_patch_couple_rejects_extra_fields(client: FlaskClient) -> None:
    _register(client)
    _create_couple(client)

    response = client.patch(
        "/api/couple", json={"timezone": "Europe/Paris", "invite_code": "AAAAAAAA"}
    )

    assert response.status_code == 422
    assert "invite_code" in response.get_json()["error"]["details"]


def test_couples_cannot_read_each_other(app: Flask, client: FlaskClient) -> None:
    owner_a = _register(client, "owner-a@example.com", "Owner A")
    couple_a = _create_couple(client)

    other_client = app.test_client()
    _register(other_client, "owner-b@example.com", "Owner B")
    couple_b = _create_couple(other_client)

    assert couple_a["id"] != couple_b["id"]
    assert other_client.patch("/api/couple", json={"timezone": "Europe/Paris"}).status_code == 200

    view_a = client.get("/api/couple").get_json()["couple"]
    view_b = other_client.get("/api/couple").get_json()["couple"]

    assert view_a["id"] == couple_a["id"]
    assert view_a["timezone"] == DEFAULT_TIMEZONE
    assert view_a["members"] == [{"id": owner_a["id"], "display_name": "Owner A"}]

    assert view_b["id"] == couple_b["id"]
    assert view_b["timezone"] == "Europe/Paris"


def test_join_is_rate_limited_to_ten_per_minute(client: FlaskClient) -> None:
    _register(client)

    for _ in range(10):
        response = _join(client, "AAAAAAAA")
        assert response.status_code == 404

    blocked = _join(client, "AAAAAAAA")
    assert blocked.status_code == 429
    assert blocked.get_json()["error"]["code"] == "rate_limited"


def test_concurrent_join_lets_exactly_one_win(app: Flask) -> None:
    """Two threads race for the single remaining seat; one gets couple_full.

    This test intentionally bypasses the per-test rollback fixture: a second
    thread needs its own committed rows and its own connection to contend on the
    couple row lock. Rows are removed in ``finally`` even if an assertion fails.
    """
    suffix = uuid.uuid4().hex[:12]
    created_ids: list[int] = []
    couple_id: int | None = None
    invite_code = ""

    try:
        with app.app_context():
            owner = User(
                email=f"concurrent-{suffix}-owner@example.com",
                password_hash="x",
                display_name="Owner",
            )
            first = User(
                email=f"concurrent-{suffix}-first@example.com",
                password_hash="x",
                display_name="First",
            )
            second = User(
                email=f"concurrent-{suffix}-second@example.com",
                password_hash="x",
                display_name="Second",
            )
            db.session.add_all([owner, first, second])
            db.session.commit()
            created_ids = [owner.id, first.id, second.id]

            couple = couple_service.create_couple(owner, None)
            couple_id = couple.id
            invite_code = couple.invite_code
            first_id, second_id = first.id, second.id
            db.session.remove()

        barrier = threading.Barrier(2)
        results: dict[str, str] = {}
        errors: list[BaseException] = []

        def worker(label: str, user_id: int) -> None:
            with app.app_context():
                try:
                    barrier.wait(timeout=10)
                    user = db.session.get(User, user_id)
                    assert user is not None
                    couple_service.join_couple(user, invite_code)
                    results[label] = "ok"
                except ApiError as exc:
                    results[label] = exc.code
                except BaseException as exc:  # noqa: BLE001 - re-raised below
                    errors.append(exc)
                finally:
                    db.session.rollback()
                    db.session.remove()

        threads = [
            threading.Thread(target=worker, args=("first", first_id), daemon=True),
            threading.Thread(target=worker, args=("second", second_id), daemon=True),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        assert not any(thread.is_alive() for thread in threads)
        assert errors == []
        assert sorted(results.values()) == ["couple_full", "ok"]

        with app.app_context():
            member_count = db.session.scalar(
                select(func.count()).select_from(User).where(User.couple_id == couple_id)
            )
            assert member_count == 2
    finally:
        with app.app_context():
            db.session.rollback()
            couple_ids = {couple_id} if couple_id is not None else set()
            if created_ids:
                couple_ids.update(
                    cid
                    for cid in db.session.scalars(
                        select(User.couple_id).where(
                            User.id.in_(created_ids), User.couple_id.is_not(None)
                        )
                    )
                    if cid is not None
                )
                db.session.execute(delete(User).where(User.id.in_(created_ids)))
            if couple_ids:
                db.session.execute(delete(Couple).where(Couple.id.in_(couple_ids)))
            db.session.commit()
            db.session.remove()
