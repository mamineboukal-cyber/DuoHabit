"""Today dashboard route."""

from __future__ import annotations

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..services import dashboard_service

bp = Blueprint("dashboard", __name__)


@bp.get("/today")
@login_required
def get_today():
    return jsonify(dashboard_service.today_payload(current_user))
