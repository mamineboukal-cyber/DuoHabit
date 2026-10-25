interface XpBarProps {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export default function XpBar({ level, xpIntoLevel, xpForNextLevel }: XpBarProps) {
  const percent =
    xpForNextLevel > 0 ? Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100)) : 0;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="shrink-0 rounded-pill bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
        Level {level}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs text-content-muted">
          <span>XP</span>
          <span>
            {xpIntoLevel} / {xpForNextLevel}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="XP progress"
          aria-valuemin={0}
          aria-valuemax={xpForNextLevel}
          aria-valuenow={xpIntoLevel}
          className="mt-1 h-2 overflow-hidden rounded-pill bg-surface-raised"
        >
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
