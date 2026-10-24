"""API error types and JSON error handlers (PLAN section 7)."""

from __future__ import annotations

from typing import Any

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

_HTTP_ERRORS: dict[int, tuple[str, str]] = {
    400: ("bad_json", "The request body could not be parsed as JSON."),
    404: ("not_found", "The requested resource was not found."),
    405: ("method_not_allowed", "This method is not allowed for the requested URL."),
    415: ("unsupported_media_type", "Content-Type must be application/json."),
}


class ApiError(Exception):
    """Raised by routes/services to return the standard error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details

    def to_response(self) -> tuple[Any, int]:
        return error_response(self.code, self.message, self.status_code, self.details)


def error_response(
    code: str,
    message: str,
    status_code: int,
    details: dict[str, Any] | None = None,
) -> tuple[Any, int]:
    """Build the canonical ``{"error": {...}}`` response body."""
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status_code


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError) -> tuple[Any, int]:
        return exc.to_response()

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException) -> tuple[Any, int]:
        code, message = _HTTP_ERRORS.get(
            exc.code or 500,
            ("http_error", exc.description or "Request failed."),
        )
        return error_response(code, message, exc.code or 500)

    @app.errorhandler(Exception)
    def handle_unexpected_error(exc: Exception) -> tuple[Any, int]:
        app.logger.exception("Unhandled exception", exc_info=exc)
        return error_response("internal_error", "An unexpected error occurred.", 500)
