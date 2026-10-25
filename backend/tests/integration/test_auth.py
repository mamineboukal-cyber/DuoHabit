"""F1 acceptance criteria and auth API behaviour."""

from __future__ import annotations

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User

PASSWORD = "correct-horse-battery"
REGISTER_PAYLOAD = {
    "email": "alice@example.com",
    "password": PASSWORD,
    "display_name": "Alice",
}


def _register(client: FlaskClient, **overrides: object):
    payload = {**REGISTER_PAYLOAD, **overrides}
    return client.post("/api/auth/register", json=payload)


def test_register_returns_201_and_starts_session(client: FlaskClient) -> None:
    response = _register(client)

    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["email"] == "alice@example.com"
    assert user["display_name"] == "Alice"
    assert user["couple_id"] is None
    assert isinstance(user["id"], int)

    cookie = response.headers["Set-Cookie"]
    assert "duohabits_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_register_lowercases_the_email(client: FlaskClient) -> None:
    response = _register(client, email="Alice@Example.COM")

    assert response.status_code == 201
    assert response.get_json()["user"]["email"] == "alice@example.com"


def test_duplicate_email_is_case_insensitive(client: FlaskClient) -> None:
    assert _register(client).status_code == 201

    duplicate = _register(client, email="ALICE@example.com")

    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"]["code"] == "email_taken"


def test_registration_allowlist(app: Flask, client: FlaskClient, monkeypatch) -> None:
    monkeypatch.setitem(app.config, "ALLOWED_EMAILS", ["allowed@example.com"])

    closed = _register(client, email="other@example.com")
    assert closed.status_code == 403
    assert closed.get_json()["error"]["code"] == "registration_closed"

    allowed = _register(client, email="allowed@example.com")
    assert allowed.status_code == 201


def test_register_validation_errors(client: FlaskClient) -> None:
    weak = _register(client, password="short")
    assert weak.status_code == 422
    assert weak.get_json()["error"]["code"] == "validation_error"
    assert "password" in weak.get_json()["error"]["details"]

    too_long = _register(client, password="x" * 129)
    assert too_long.status_code == 422
    assert "password" in too_long.get_json()["error"]["details"]

    blank = _register(client, display_name="   ")
    assert blank.status_code == 422
    assert "display_name" in blank.get_json()["error"]["details"]

    extra = _register(client, is_admin=True)
    assert extra.status_code == 422
    assert "is_admin" in extra.get_json()["error"]["details"]

    bad_email = _register(client, email="not-an-email")
    assert bad_email.status_code == 422
    assert "email" in bad_email.get_json()["error"]["details"]


def test_login_success_and_uniform_failure(client: FlaskClient) -> None:
    assert _register(client).status_code == 201
    assert client.post("/api/auth/logout").status_code == 204

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "wrong-password"},
    )
    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
    )

    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.get_json() == unknown_email.get_json()
    assert wrong_password.get_json()["error"]["code"] == "invalid_credentials"

    success = client.post(
        "/api/auth/login",
        json={"email": "Alice@Example.com", "password": PASSWORD},
    )
    assert success.status_code == 200
    assert success.get_json()["user"]["email"] == "alice@example.com"
    assert client.get("/api/auth/me").status_code == 200


def test_logout_invalidates_the_session(client: FlaskClient) -> None:
    assert _register(client).status_code == 201

    assert client.post("/api/auth/logout").status_code == 204

    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthenticated"


def test_patch_me_updates_display_name(client: FlaskClient) -> None:
    assert _register(client).status_code == 201

    response = client.patch("/api/auth/me", json={"display_name": "Alice B"})
    assert response.status_code == 200
    assert response.get_json()["user"]["display_name"] == "Alice B"
    assert client.get("/api/auth/me").get_json()["user"]["display_name"] == "Alice B"

    too_long = client.patch("/api/auth/me", json={"display_name": "x" * 41})
    assert too_long.status_code == 422
    assert "display_name" in too_long.get_json()["error"]["details"]


def test_eleventh_credentials_request_is_rate_limited(client: FlaskClient) -> None:
    payload = {"email": "nobody@example.com", "password": "wrong-password"}

    for _ in range(10):
        response = client.post("/api/auth/login", json=payload)
        assert response.status_code == 401

    blocked = client.post("/api/auth/login", json=payload)
    assert blocked.status_code == 429
    assert blocked.get_json()["error"]["code"] == "rate_limited"


def test_me_is_not_part_of_the_credentials_bucket(client: FlaskClient) -> None:
    assert _register(client).status_code == 201

    for _ in range(15):
        assert client.get("/api/auth/me").status_code == 200


def test_responses_never_contain_password_or_hash(client: FlaskClient, db_session: Session) -> None:
    register = _register(client)
    assert register.status_code == 201

    user = db_session.scalar(select(User).where(User.email == "alice@example.com"))
    assert user is not None
    password_hash = user.password_hash
    assert PASSWORD not in password_hash

    responses = [
        register,
        client.get("/api/auth/me"),
        client.post(
            "/api/auth/login",
            json={"email": "alice@example.com", "password": PASSWORD},
        ),
        client.patch("/api/auth/me", json={"display_name": "Alice B"}),
        client.post(
            "/api/auth/login",
            json={"email": "alice@example.com", "password": "wrong-password"},
        ),
    ]

    for response in responses:
        body = response.get_data(as_text=True)
        assert PASSWORD not in body
        assert password_hash not in body
        assert "password_hash" not in body
