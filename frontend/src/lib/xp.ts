/** Frontend mirror of backend ``scoring.xp_progress`` for optimistic updates. */

export interface XpProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export function xpProgress(totalXp: number): XpProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(Math.sqrt(Math.floor(safeXp / 100))) + 1;

  return {
    level,
    xpIntoLevel: safeXp - 100 * (level - 1) ** 2,
    xpForNextLevel: 100 * level ** 2 - 100 * (level - 1) ** 2,
  };
}
