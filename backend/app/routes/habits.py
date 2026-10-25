"""Habit routes: list, create, edit and archive."""

from __future__ import annotations

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..schemas import parse_body, parse_query
from ..schemas.checkin import CreateCheckinRequest, parse_checkin_date
from ..schemas.habit import CreateHabitRequest, HabitListQuery, UpdateHabitRequest
from ..services import checkin_service, habit_service

bp = Blueprint("habits", __name__)


@bp.get("/habits")
@login_required
def list_habits():
    query = parse_query(HabitListQuery)

    habits = habit_service.list_habits(
        current_user,
        owner=query.owner,
        include_archived=query.include_archived,
    )
    return jsonify(habits=[habit_service.habit_payload(habit) for habit in habits])


@bp.post("/habits")
@login_required
def create_habit():
    payload = parse_body(CreateHabitRequest)

    habit = habit_service.create_habit(
        current_user,
        name=payload.name,
        emoji=payload.emoji,
        difficulty=payload.difficulty,
        schedule_days=payload.schedule_days,
    )
    return jsonify(habit=habit_service.habit_payload(habit)), 201


@bp.patch("/habits/<int:habit_id>")
@login_required
def update_habit(habit_id: int):
    payload = parse_body(UpdateHabitRequest)

    habit = habit_service.update_habit(
        current_user, habit_id, payload.model_dump(exclude_unset=True)
    )
    return jsonify(habit=habit_service.habit_payload(habit))


@bp.delete("/habits/<int:habit_id>")
@login_required
def archive_habit(habit_id: int):
    habit_service.archive_habit(current_user, habit_id)
    return "", 204


@bp.post("/habits/<int:habit_id>/checkins")
@login_required
def create_checkin(habit_id: int):
    payload = parse_body(CreateCheckinRequest)

    checkin, habit, total_xp, level = checkin_service.create_checkin(
        current_user,
        habit_id,
        payload.date,
    )
    return jsonify(
        checkin=checkin_service.checkin_payload(checkin),
        habit=habit_service.habit_payload(habit),
        total_xp=total_xp,
        level=level,
    ), 201


@bp.delete("/habits/<int:habit_id>/checkins/<string:checkin_date>")
@login_required
def undo_checkin(habit_id: int, checkin_date: str):
    parsed_date = parse_checkin_date(checkin_date)

    habit, total_xp, level = checkin_service.undo_checkin(
        current_user,
        habit_id,
        parsed_date,
    )
    return jsonify(
        habit=habit_service.habit_payload(habit),
        total_xp=total_xp,
        level=level,
    )
