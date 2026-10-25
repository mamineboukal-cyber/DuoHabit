"""Pure scoring and level functions (PLAN section 2)."""

from __future__ import annotations

import math

_MAX_MULTIPLIER_STEPS = 5


def multiplier(streak_at_checkin: int) -> float:
    """Return the streak multiplier for a check-in (1.0 through 1.5)."""
    return 1 + 0.1 * min(streak_at_checkin - 1, _MAX_MULTIPLIER_STEPS)


def points(difficulty: int, streak_at_checkin: int) -> int:
    """Return the points awarded for a check-in."""
    base_points = 10 * difficulty
    return int(base_points * multiplier(streak_at_checkin) + 0.5)


def level_for_xp(total_xp: int) -> int:
    """Return the level reached at ``total_xp``."""
    return math.isqrt(total_xp // 100) + 1
