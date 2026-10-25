"""Duel routes: current week and finalized history."""

from __future__ import annotations

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..schemas import parse_query
from ..schemas.duel import DuelHistoryQuery
from ..services import duel_service

bp = Blueprint("duel", __name__)


@bp.get("/duel/current")
@login_required
def get_current_duel():
    return jsonify(duel_service.current_duel(current_user))


@bp.get("/duel/history")
@login_required
def get_duel_history():
    query = parse_query(DuelHistoryQuery)
    return jsonify(weeks=duel_service.history(current_user, query.limit))
