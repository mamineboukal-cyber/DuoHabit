"""Cross-cutting security hooks: Origin, Content-Type and response headers."""

from __future__ import annotations

from flask import Flask, request

from .errors import ApiError

_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
)


def register_security(app: Flask) -> None:
    """Attach the request guards and security headers described in PLAN section 9."""

    @app.before_request
    def enforce_origin() -> None:
        if request.method not in _WRITE_METHODS:
            return

        origin = request.headers.get("Origin")
        if origin is not None and origin not in app.config["ALLOWED_ORIGINS"]:
            raise ApiError(403, "bad_origin", "Origin not allowed.")

    @app.before_request
    def enforce_json_content_type() -> None:
        if request.method not in _WRITE_METHODS:
            return

        if request.content_length and not request.is_json:
            raise ApiError(
                415,
                "unsupported_media_type",
                "Content-Type must be application/json.",
            )

    @app.after_request
    def set_security_headers(response):
        response.headers.setdefault("Content-Security-Policy", _CONTENT_SECURITY_POLICY)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")

        if app.config.get("ENVIRONMENT") == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        return response
