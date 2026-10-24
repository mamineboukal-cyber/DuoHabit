"""Health endpoint and JSON error format."""

from __future__ import annotations

from flask.testing import FlaskClient


def test_health_returns_ok(client: FlaskClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_unknown_api_route_returns_json_404(client: FlaskClient) -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    body = response.get_json()
    assert body["error"]["code"] == "not_found"
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]


def test_wrong_method_returns_json_405(client: FlaskClient) -> None:
    response = client.post("/api/health")

    assert response.status_code == 405
    body = response.get_json()
    assert body["error"]["code"] == "method_not_allowed"
