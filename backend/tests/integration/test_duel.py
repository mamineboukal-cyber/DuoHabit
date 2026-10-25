"""F7 acceptance criteria: the weekly duel."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import Flask
from flask.testing import FlaskClient
from freezegun import freeze_time
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.extensions import db
from app.models import Checkin, Couple, Habit, User, WeeklyResult
from app.services import couple_service, duel_service
from app.services.timeutil import today_in_tz, week_start

PASSWORD = "correct-horse-battery"
TIMEZONE = "Africa/Casablanca"
CASABLANCA = ZoneInfo(TIMEZONE)


def _local_instant(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    """Return the UTC instant for a Casablanca wall-clock time (offset-agnostic)."""
    local = datetime(year, month, day, hour, minute, tzinfo=CASABLANCA)
    return local.astimezone(UTC)


@dataclass
class PairedCouple:
    owner: dict
    owner_client: FlaskClient
    partner: dict
    partner_client: FlaskClient
    couple: dict


def _register(client: FlaskClient, email: str, display_name: str = "User") -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["user"]


def _create_couple(client: FlaskClient, **payload: object) -> dict:
    response = client.post("/api/couple", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["couple"]


def _join_couple(client: FlaskClient, invite_code: str) -> dict:
    response = client.post("/api/couple/join", json={"invite_code": invite_code})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["couple"]


def _pair(app: Flask, client: FlaskClient) -> PairedCouple:
    """Register and pair two users.

    Called inside a ``freeze_time`` block: pytest sets fixtures up before the
    decorator starts, and a session signed at real time is rejected when it is
    later validated against an earlier frozen clock.
    """
    owner = _register(client, "owner@example.com", "Owner")
    couple = _create_couple(client)

    partner_client = app.test_client()
    partner = _register(partner_client, "partner@example.com", "Partner")
    _join_couple(partner_client, couple["invite_code"])

    return PairedCouple(owner, client, partner, partner_client, couple)


def _create_habit(client: FlaskClient, **overrides: object) -> int:
    response = client.post("/api/habits", json={"name": "Run", **overrides})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["habit"]["id"]


def _checkin(client: FlaskClient, habit_id: int, checkin_date: date | str):
    value = checkin_date.isoformat() if isinstance(checkin_date, date) else checkin_date
    return client.post(f"/api/habits/{habit_id}/checkins", json={"date": value})


def _duel(client: FlaskClient) -> dict:
    response = client.get("/api/duel/current")
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _history(client: FlaskClient, query: str = "") -> list[dict]:
    response = client.get(f"/api/duel/history{query}")
    assert response.status_code == 200, response.get_json()
    return response.get_json()["weeks"]


def _backdate(
    db_session: Session,
    couple_id: int,
    member_ids: list[int],
    created_at: datetime,
) -> None:
    """Set when the couple and its members started, so finalization can see past weeks."""
    couple = db_session.get(Couple, couple_id)
    assert couple is not None
    couple.created_at = created_at
    for member_id in member_ids:
        member = db_session.get(User, member_id)
        assert member is not None
        member.created_at = created_at
    db_session.flush()


def _insert_checkin(
    db_session: Session,
    habit_id: int,
    user_id: int,
    checkin_date: date,
    points: int,
) -> None:
    """Seed history directly: the API only accepts today and yesterday (A14)."""
    db_session.execute(
        text(
            """
            INSERT INTO checkins
                (habit_id, user_id, checkin_date, points, streak_at_checkin)
            VALUES
                (:habit_id, :user_id, :checkin_date, :points, 1)
            """
        ),
        {
            "habit_id": habit_id,
            "user_id": user_id,
            "checkin_date": checkin_date,
            "points": points,
        },
    )


def test_current_week_reports_points_counts_leader_and_days_left(
    app: Flask,
    client: FlaskClient,
) -> None:
    with freeze_time(_local_instant(2026, 10, 21, 12)):
        paired = _pair(app, client)
        easy_id = _create_habit(paired.owner_client, name="Walk")
        hard_id = _create_habit(paired.partner_client, name="Gym", difficulty=3)

        assert _checkin(paired.owner_client, easy_id, date(2026, 10, 20)).status_code == 201
        assert _checkin(paired.owner_client, easy_id, date(2026, 10, 21)).status_code == 201
        assert _checkin(paired.partner_client, hard_id, date(2026, 10, 21)).status_code == 201

        body = _duel(paired.owner_client)

        assert body["week_start"] == "2026-10-19"
        assert body["week_end"] == "2026-10-25"
        assert body["days_left"] == 5
        assert body["me"] == {
            "user_id": paired.owner["id"],
            "display_name": "Owner",
            "points": 21,
            "checkins": 2,
        }
        assert body["partner"] == {
            "user_id": paired.partner["id"],
            "display_name": "Partner",
            "points": 30,
            "checkins": 1,
        }
        assert body["leader"] == "partner"
        assert body["tally"] == {"me_wins": 0, "partner_wins": 0, "ties": 0}

        partner_view = _duel(paired.partner_client)
        assert partner_view["leader"] == "me"
        assert partner_view["me"]["points"] == 30
        assert partner_view["partner"]["points"] == 21


def test_current_week_can_be_a_tie(app: Flask, client: FlaskClient) -> None:
    with freeze_time(_local_instant(2026, 10, 21, 12)):
        paired = _pair(app, client)
        owner_habit = _create_habit(paired.owner_client, name="Owner run")
        partner_habit = _create_habit(paired.partner_client, name="Partner run")
        assert _checkin(paired.owner_client, owner_habit, date(2026, 10, 21)).status_code == 201
        assert _checkin(paired.partner_client, partner_habit, date(2026, 10, 21)).status_code == 201

        body = _duel(paired.owner_client)

        assert body["me"]["points"] == 10
        assert body["partner"]["points"] == 10
        assert body["leader"] == "tie"


def test_solo_couple_has_no_partner_tally_or_history(client: FlaskClient) -> None:
    with freeze_time(_local_instant(2026, 10, 21, 12)):
        _register(client, "solo@example.com", "Solo")
        _create_couple(client)
        habit_id = _create_habit(client)
        assert _checkin(client, habit_id, date(2026, 10, 21)).status_code == 201

        body = _duel(client)

        assert body["week_start"] == "2026-10-19"
        assert body["days_left"] == 5
        assert body["me"]["points"] == 10
        assert body["me"]["checkins"] == 1
        assert body["partner"] is None
        assert body["leader"] == "me"
        assert body["tally"] == {"me_wins": 0, "partner_wins": 0, "ties": 0}
        assert _history(client) == []


def test_duel_requires_a_session_and_a_couple(client: FlaskClient) -> None:
    for path in ("/api/duel/current", "/api/duel/history"):
        unauthenticated = client.get(path)
        assert unauthenticated.status_code == 401
        assert unauthenticated.get_json()["error"]["code"] == "unauthenticated"

    _register(client, "solo@example.com", "Solo")

    for path in ("/api/duel/current", "/api/duel/history"):
        no_couple = client.get(path)
        assert no_couple.status_code == 409
        assert no_couple.get_json()["error"]["code"] == "no_couple"


def test_past_week_finalizes_once_as_a_win(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    with freeze_time(_local_instant(2026, 10, 27, 12)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 5, 12, tzinfo=UTC),
        )
        owner_habit = _create_habit(paired.owner_client, name="Hard run", difficulty=3)
        partner_habit = _create_habit(paired.partner_client, name="Medium run", difficulty=2)
        _insert_checkin(db_session, owner_habit, paired.owner["id"], date(2026, 10, 21), 30)
        _insert_checkin(db_session, partner_habit, paired.partner["id"], date(2026, 10, 22), 20)

        body = _duel(paired.owner_client)
        assert body["week_start"] == "2026-10-26"
        assert body["days_left"] == 6
        assert body["tally"] == {"me_wins": 1, "partner_wins": 0, "ties": 2}

        weeks = _history(paired.owner_client)
        assert [week["week_start"] for week in weeks] == [
            "2026-10-19",
            "2026-10-12",
            "2026-10-05",
        ]
        assert weeks[0] == {
            "week_start": "2026-10-19",
            "me_points": 30,
            "partner_points": 20,
            "result": "win",
        }
        assert weeks[1]["result"] == "tie"
        assert weeks[1]["me_points"] == 0

        partner_view = _history(paired.partner_client)
        assert partner_view[0]["result"] == "loss"
        assert partner_view[0]["me_points"] == 20
        assert partner_view[0]["partner_points"] == 30
        assert _duel(paired.partner_client)["tally"] == {
            "me_wins": 0,
            "partner_wins": 1,
            "ties": 2,
        }

        # Repeating both calls must not duplicate rows.
        _duel(paired.owner_client)
        _history(paired.owner_client)
        rows = list(
            db_session.scalars(
                select(WeeklyResult)
                .where(WeeklyResult.couple_id == paired.couple["id"])
                .order_by(WeeklyResult.week_start)
            )
        )
        assert [row.week_start for row in rows] == [
            date(2026, 10, 5),
            date(2026, 10, 12),
            date(2026, 10, 19),
        ]

        # Point 6: the lower user id is always stored as user_a, and 0-0 is a NULL winner.
        for row in rows:
            assert row.user_a_id == min(member_ids)
            assert row.user_b_id == max(member_ids)
            assert row.user_a_id < row.user_b_id
        win_row, zero_row = rows[2], rows[1]
        assert (win_row.user_a_points, win_row.user_b_points) == (30, 20)
        assert win_row.winner_user_id == paired.owner["id"]
        assert (zero_row.user_a_points, zero_row.user_b_points) == (0, 0)
        assert zero_row.winner_user_id is None


def test_tied_week_is_stored_with_a_null_winner(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    with freeze_time(_local_instant(2026, 10, 27, 12)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 19, 12, tzinfo=UTC),
        )
        owner_habit = _create_habit(paired.owner_client, name="Owner run")
        partner_habit = _create_habit(paired.partner_client, name="Partner run")
        _insert_checkin(db_session, owner_habit, paired.owner["id"], date(2026, 10, 21), 20)
        _insert_checkin(db_session, partner_habit, paired.partner["id"], date(2026, 10, 22), 20)

        weeks = _history(paired.owner_client)

        assert len(weeks) == 1
        assert weeks[0] == {
            "week_start": "2026-10-19",
            "me_points": 20,
            "partner_points": 20,
            "result": "tie",
        }
        row = db_session.scalar(select(WeeklyResult))
        assert row is not None
        assert row.winner_user_id is None
        assert _duel(paired.owner_client)["tally"]["ties"] == 1


def test_last_week_is_not_finalized_on_monday_but_is_on_tuesday(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    """A14 grace period: Sunday's habit can still be logged on Monday."""
    with freeze_time(_local_instant(2026, 10, 26, 12)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 19, 12, tzinfo=UTC),
        )
        habit_id = _create_habit(paired.owner_client, name="Late run")
        _insert_checkin(db_session, habit_id, paired.owner["id"], date(2026, 10, 24), 10)

        monday = _duel(paired.owner_client)
        assert monday["week_start"] == "2026-10-26"
        assert monday["days_left"] == 7
        assert _history(paired.owner_client) == []
        assert db_session.scalar(select(func.count()).select_from(WeeklyResult)) == 0

        with freeze_time(_local_instant(2026, 10, 27, 12)):
            tuesday = _duel(paired.owner_client)
            assert tuesday["days_left"] == 6
            weeks = _history(paired.owner_client)
            assert [week["week_start"] for week in weeks] == ["2026-10-19"]
            assert weeks[0]["me_points"] == 10
            assert weeks[0]["result"] == "win"


def test_history_endpoint_alone_finalizes_past_weeks(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    with freeze_time(_local_instant(2026, 10, 27, 12)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 19, 12, tzinfo=UTC),
        )

        weeks = _history(paired.partner_client)

        assert weeks == [
            {
                "week_start": "2026-10-19",
                "me_points": 0,
                "partner_points": 0,
                "result": "tie",
            }
        ]
        assert db_session.scalar(select(func.count()).select_from(WeeklyResult)) == 1


def test_history_is_newest_first_and_validates_limit(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    with freeze_time(_local_instant(2026, 10, 27, 12)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 5, 12, tzinfo=UTC),
        )
        _duel(paired.owner_client)

        assert [week["week_start"] for week in _history(paired.owner_client, "?limit=2")] == [
            "2026-10-19",
            "2026-10-12",
        ]
        assert len(_history(paired.owner_client)) == 3
        assert len(_history(paired.owner_client, "?limit=1")) == 1
        assert len(_history(paired.owner_client, "?limit=52")) == 3

        for bad in ("0", "53", "abc", "1.5", ""):
            query = f"?limit={bad}" if bad else "?limit="
            response = paired.owner_client.get(f"/api/duel/history{query}")
            assert response.status_code == 422, (bad, response.get_json())
            error = response.get_json()["error"]
            assert error["code"] == "validation_error"
            assert "limit" in error["details"]

        extra = paired.owner_client.get("/api/duel/history?limit=5&foo=1")
        assert extra.status_code == 422
        assert "foo" in extra.get_json()["error"]["details"]


def test_history_starts_when_the_partner_joined(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    """Point 2: weeks the second member did not exist in are never stored."""
    with freeze_time(_local_instant(2026, 10, 27, 12)):
        paired = _pair(app, client)
        couple = db_session.get(Couple, paired.couple["id"])
        assert couple is not None
        couple.created_at = datetime(2026, 10, 5, 12, tzinfo=UTC)
        owner = db_session.get(User, paired.owner["id"])
        assert owner is not None
        owner.created_at = datetime(2026, 10, 5, 12, tzinfo=UTC)
        partner = db_session.get(User, paired.partner["id"])
        assert partner is not None
        partner.created_at = datetime(2026, 10, 19, 12, tzinfo=UTC)
        db_session.flush()

        habit_id = _create_habit(paired.owner_client, name="Early run")
        _insert_checkin(db_session, habit_id, paired.owner["id"], date(2026, 10, 7), 10)
        _insert_checkin(db_session, habit_id, paired.owner["id"], date(2026, 10, 14), 10)
        _insert_checkin(db_session, habit_id, paired.owner["id"], date(2026, 10, 21), 10)

        weeks = _history(paired.owner_client)

        assert [week["week_start"] for week in weeks] == ["2026-10-19"]
        assert weeks[0]["me_points"] == 10
        assert weeks[0]["result"] == "win"
        stored = set(db_session.scalars(select(WeeklyResult.week_start)))
        assert stored == {date(2026, 10, 19)}
        assert date(2026, 10, 5) not in stored
        assert date(2026, 10, 12) not in stored


def test_sunday_night_and_monday_rollover_follow_the_couple_timezone(
    app: Flask,
    client: FlaskClient,
    db_session: Session,
) -> None:
    with freeze_time(_local_instant(2026, 10, 25, 23, 30)):
        paired = _pair(app, client)
        member_ids = [paired.owner["id"], paired.partner["id"]]
        _backdate(
            db_session,
            paired.couple["id"],
            member_ids,
            datetime(2026, 10, 19, 12, tzinfo=UTC),
        )
        habit_id = _create_habit(paired.owner_client, name="Late run")
        _insert_checkin(db_session, habit_id, paired.owner["id"], date(2026, 10, 24), 10)

        sunday = _duel(paired.owner_client)
        assert sunday["week_start"] == "2026-10-19"
        assert sunday["week_end"] == "2026-10-25"
        assert sunday["days_left"] == 1
        assert sunday["me"]["points"] == 10
        assert sunday["partner"]["points"] == 0
        assert sunday["leader"] == "me"
        assert _history(paired.owner_client) == []

        with freeze_time(_local_instant(2026, 10, 26, 0, 30)):
            monday = _duel(paired.owner_client)
            assert monday["week_start"] == "2026-10-26"
            assert monday["week_end"] == "2026-11-01"
            assert monday["days_left"] == 7
            assert monday["me"]["points"] == 0
            # Monday is still inside the A14 grace period for last week.
            assert _history(paired.owner_client) == []


def test_concurrent_finalize_creates_exactly_one_row(app: Flask) -> None:
    """Two threads finalize the same week; the unique key must absorb one insert.

    Like the Step 4 join race, this test commits real rows and removes them in
    ``finally`` because a second thread needs its own connection.
    """
    suffix = uuid.uuid4().hex[:12]
    created_user_ids: list[int] = []
    couple_id: int | None = None
    today = today_in_tz(TIMEZONE)
    target_week = week_start(today - timedelta(days=8))
    created_at = datetime.combine(target_week, time(12, 0), tzinfo=UTC)

    try:
        with app.app_context():
            owner = User(
                email=f"duel-{suffix}-owner@example.com",
                password_hash="x",
                display_name="Owner",
                created_at=created_at,
            )
            partner = User(
                email=f"duel-{suffix}-partner@example.com",
                password_hash="x",
                display_name="Partner",
                created_at=created_at,
            )
            db.session.add_all([owner, partner])
            db.session.commit()
            created_user_ids = [owner.id, partner.id]

            couple = couple_service.create_couple(owner, None)
            couple_id = couple.id
            partner.couple_id = couple.id
            couple.created_at = created_at
            owner.created_at = created_at
            partner.created_at = created_at
            db.session.commit()

            habit = Habit(
                owner_id=owner.id,
                couple_id=couple.id,
                name="Duel habit",
                difficulty=1,
                schedule_days=[0, 1, 2, 3, 4, 5, 6],
            )
            db.session.add(habit)
            db.session.flush()
            db.session.add(
                Checkin(
                    habit_id=habit.id,
                    user_id=owner.id,
                    checkin_date=target_week,
                    points=10,
                    streak_at_checkin=1,
                )
            )
            db.session.commit()
            owner_id = owner.id
            db.session.remove()

        barrier = threading.Barrier(2)
        errors: list[BaseException] = []

        def worker() -> None:
            with app.app_context():
                try:
                    barrier.wait(timeout=10)
                    couple = db.session.get(Couple, couple_id)
                    assert couple is not None
                    duel_service.finalize_past_weeks(couple, today)
                except BaseException as exc:  # noqa: BLE001 - re-raised below
                    errors.append(exc)
                finally:
                    db.session.rollback()
                    db.session.remove()

        threads = [threading.Thread(target=worker, daemon=True) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        assert not any(thread.is_alive() for thread in threads)
        assert errors == []

        with app.app_context():
            rows = list(
                db.session.scalars(select(WeeklyResult).where(WeeklyResult.couple_id == couple_id))
            )
            assert len(rows) == 1
            assert rows[0].week_start == target_week
            assert rows[0].user_a_id == owner_id
            assert rows[0].user_a_points == 10
            assert rows[0].winner_user_id == owner_id
    finally:
        with app.app_context():
            db.session.rollback()
            if couple_id is not None:
                db.session.execute(delete(WeeklyResult).where(WeeklyResult.couple_id == couple_id))
                db.session.execute(delete(Checkin).where(Checkin.user_id.in_(created_user_ids)))
                db.session.execute(delete(Habit).where(Habit.couple_id == couple_id))
                if created_user_ids:
                    db.session.execute(delete(User).where(User.id.in_(created_user_ids)))
                db.session.execute(delete(Couple).where(Couple.id == couple_id))
                db.session.commit()
            db.session.remove()
