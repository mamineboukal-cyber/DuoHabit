"""Auth routes: register, login, logout and the current user's profile."""

from __future__ import annotations

from flask import Blueprint, jsonify, session
from flask_limiter.util import get_remote_address
from flask_login import current_user, login_required, login_user, logout_user

from ..extensions import limiter
from ..schemas import parse_body
from ..schemas.auth import LoginRequest, RegisterRequest, UpdateMeRequest
from ..services import auth_service

bp = Blueprint("auth", __name__)


def _credentials_limit(view):
    """Share one 10/min per-IP bucket between register and login (PLAN section 9)."""
    return limiter.shared_limit(
        "10 per minute",
        scope="auth-credentials",
        key_func=get_remote_address,
    )(view)


@bp.post("/register")
@_credentials_limit
def register():
    payload = parse_body(RegisterRequest)

    user = auth_service.register_user(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
    )
    login_user(user)
    session.permanent = True

    return jsonify(user=auth_service.user_payload(user)), 201


@bp.post("/login")
@_credentials_limit
def login():
    payload = parse_body(LoginRequest)

    user = auth_service.authenticate(email=payload.email, password=payload.password)
    login_user(user)
    session.permanent = True

    return jsonify(user=auth_service.user_payload(user)), 200


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    return "", 204


@bp.get("/me")
@login_required
def me():
    return jsonify(user=auth_service.user_payload(current_user))


@bp.patch("/me")
@login_required
def update_me():
    payload = parse_body(UpdateMeRequest)

    user = auth_service.update_display_name(current_user, payload.display_name)
    return jsonify(user=auth_service.user_payload(user))
