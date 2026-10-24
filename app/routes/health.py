"""Unauthenticated health check."""

from __future__ import annotations

from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)


@bp.get("/health")
def health() -> tuple[object, int]:
    return jsonify(status="ok"), 200
