"""Security hooks: Origin, Content-Type, headers and body limits."""

from __future__ import annotations

from flask import Flask
from flask.testing import FlaskClient

REGISTER_PAYLOAD = {
    "email": "alice@example.com",
    "password": "correct-horse-battery",
    "display_name": "Alice",
}

EXPECTED_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"


def test_bad_origin_is_rejected(app: Flask, client: FlaskClient, monkeypatch) -> None:
    monkeypatch.setitem(app.config, "ALLOWED_ORIGINS", ["http://localhost:5173"])

    response = client.post(
        "/api/auth/register",
        json=REGISTER_PAYLOAD,
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "bad_origin"


def test_allowed_origin_is_accepted(app: Flask, client: FlaskClient, monkeypatch) -> None:
    monkeypatch.setitem(app.config, "ALLOWED_ORIGINS", ["http://localhost:5173"])

    response = client.post(
        "/api/auth/register",
        json=REGISTER_PAYLOAD,
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 201


def test_non_json_body_is_rejected(client: FlaskClient) -> None:
    response = client.post(
        "/api/auth/register",
        data="email=alice@example.com&password=correct-horse-battery",
        content_type="application/x-www-form-urlencoded",
    )

    assert response.status_code == 415
    assert response.get_json()["error"]["code"] == "unsupported_media_type"


def test_malformed_json_returns_the_standard_error(client: FlaskClient) -> None:
    response = client.post(
        "/api/auth/register",
        data="{not valid json",
        content_type="application/json",
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "bad_json"


def test_oversized_body_is_rejected(client: FlaskClient) -> None:
    payload = {**REGISTER_PAYLOAD, "password": "x" * 70_000}

    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "request_too_large"


def test_security_headers_are_present(client: FlaskClient) -> None:
    response = client.get("/api/health")

    assert response.headers["Content-Security-Policy"] == EXPECTED_CSP
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "same-origin"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "Strict-Transport-Security" not in response.headers


def test_security_headers_are_on_error_responses(client: FlaskClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["Content-Security-Policy"] == EXPECTED_CSP
    assert response.headers["X-Frame-Options"] == "DENY"
