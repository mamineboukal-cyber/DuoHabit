"""Unit tests for the pure scoring functions (PLAN section 2)."""

from __future__ import annotations

import pytest

from app.services.scoring import level_for_xp, multiplier, points


@pytest.mark.parametrize(
    ("difficulty", "expected"),
    [
        (1, [10, 11, 12, 13, 14, 15, 15, 15]),
        (2, [20, 22, 24, 26, 28, 30, 30, 30]),
        (3, [30, 33, 36, 39, 42, 45, 45, 45]),
    ],
)
def test_points_follow_the_multiplier_ladder(difficulty: int, expected: list[int]) -> None:
    assert [points(difficulty, streak) for streak in range(1, 9)] == expected


@pytest.mark.parametrize(
    ("streak", "expected"),
    [
        (1, 1.0),
        (2, 1.1),
        (3, 1.2),
        (4, 1.3),
        (5, 1.4),
        (6, 1.5),
        (7, 1.5),
        (100, 1.5),
    ],
)
def test_multiplier_is_capped_at_one_point_five(streak: int, expected: float) -> None:
    assert multiplier(streak) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("total_xp", "expected"),
    [
        (0, 1),
        (99, 1),
        (100, 2),
        (399, 2),
        (400, 3),
        (900, 4),
    ],
)
def test_level_boundaries(total_xp: int, expected: int) -> None:
    assert level_for_xp(total_xp) == expected
