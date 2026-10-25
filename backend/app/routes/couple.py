"""Couple routes: create, join, read and update the caller's couple."""

from __future__ import annotations

from flask import Blueprint, jsonify
from flask_limiter.util import get_remote_address
from flask_login import current_user, login_required

from ..extensions import limiter
from ..schemas import parse_body, parse_optional_body
from ..schemas.couple import CreateCoupleRequest, JoinCoupleRequest, UpdateCoupleRequest
from ..services import couple_service

bp = Blueprint("couple", __name__)


def _join_limit(view):
    """10/min per IP on join to stop invite-code guessing (PLAN section 9)."""
    return limiter.shared_limit(
        "10 per minute",
        scope="couple-join",
        key_func=get_remote_address,
    )(view)


@bp.post("/couple")
@login_required
def create_couple():
    payload = parse_optional_body(CreateCoupleRequest)

    couple = couple_service.create_couple(current_user, payload.timezone)
    return jsonify(couple=couple_service.couple_payload(couple)), 201


@bp.post("/couple/join")
@_join_limit
@login_required
def join_couple():
    payload = parse_body(JoinCoupleRequest)

    couple = couple_service.join_couple(current_user, payload.invite_code)
    return jsonify(couple=couple_service.couple_payload(couple)), 200


@bp.get("/couple")
@login_required
def get_couple():
    couple = couple_service.get_couple(current_user)
    return jsonify(couple=couple_service.couple_payload(couple))


@bp.patch("/couple")
@login_required
def update_couple():
    payload = parse_body(UpdateCoupleRequest)

    couple = couple_service.update_timezone(current_user, payload.timezone)
    return jsonify(couple=couple_service.couple_payload(couple))
