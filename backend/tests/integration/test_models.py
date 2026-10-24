"""Model constraints and relationships for users and couples."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Couple, User


def _user(**overrides: object) -> User:
    data: dict[str, object] = {
        "email": "alice@example.com",
        "password_hash": "argon2-hash",
        "display_name": "Alice",
    }
    data.update(overrides)
    return User(**data)


def test_user_and_couple_round_trip(db_session: Session) -> None:
    couple = Couple(invite_code="ABCDEFGH")
    alice = _user(couple=couple)
    bob = _user(email="bob@example.com", display_name="Bob", couple=couple)

    db_session.add_all([couple, alice, bob])
    db_session.commit()

    assert alice.id is not None
    assert alice.couple_id == couple.id
    assert alice.couple is couple
    assert alice.created_at is not None
    assert couple.timezone == "Africa/Casablanca"
    assert {member.email for member in couple.members} == {
        "alice@example.com",
        "bob@example.com",
    }


def test_duplicate_email_raises_integrity_error(db_session: Session) -> None:
    db_session.add(_user())
    db_session.commit()

    db_session.add(_user(display_name="Other Alice"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_display_name_must_not_be_empty(db_session: Session) -> None:
    db_session.add(_user(display_name=""))

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_email_must_be_lowercase(db_session: Session) -> None:
    db_session.add(_user(email="Alice@Example.com"))

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
