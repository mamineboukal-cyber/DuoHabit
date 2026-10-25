import type { TodayHabitRow } from "../api/types";

interface HabitRowProps {
  row: TodayHabitRow;
  dayLabel: "today" | "yesterday";
  readOnly?: boolean;
  pending?: boolean;
  xpGain?: number | null;
  onToggle?: () => void;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 10a8 8 0 1 1 2.3 5.7" />
      <path d="M4 4v6h6" />
    </svg>
  );
}

export default function HabitRow({
  row,
  dayLabel,
  readOnly = false,
  pending = false,
  xpGain = null,
  onToggle,
}: HabitRowProps) {
  const glyph = row.habit.emoji ?? (Array.from(row.habit.name.trim())[0]?.toUpperCase() || "•");
  const points = row.done ? (row.checkin_points ?? row.points_if_done) : row.points_if_done;
  const streak = row.habit.current_streak;
  const status = row.done ? "Done" : "Not done";
  const stateClass = row.done ? "border-success/40 bg-success-soft/30" : "border-line bg-surface";
  const rowClass = `relative flex min-h-tap w-full items-center gap-3 rounded-card border p-3 text-left shadow-lg ${stateClass}`;

  const content = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 ${
          row.done ? "border-success bg-success text-on-accent" : "border-line-strong text-surface"
        }`}
      >
        <CheckIcon />
      </span>

      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent/10 text-xl text-accent"
      >
        {glyph}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block break-words text-base font-semibold">{row.habit.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">🔥</span>
            {streak === 0 ? "No streak yet" : `${streak}-day streak`}
          </span>
          <span className="font-semibold text-success">+{points}</span>
        </span>
      </span>

      {readOnly ? (
        <span
          className={`shrink-0 rounded-pill border px-2.5 py-1 text-xs font-medium ${
            row.done
              ? "border-success/40 bg-success-soft text-success-foreground"
              : "border-line bg-surface-raised text-content-muted"
          }`}
        >
          {status}
        </span>
      ) : (
        row.done && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
            <UndoIcon />
            Undo
          </span>
        )
      )}

      {xpGain !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1 animate-xp-float rounded-pill bg-success-soft px-2 py-0.5 text-xs font-bold text-success-foreground motion-reduce:animate-none"
        >
          +{xpGain} XP
        </span>
      )}
    </>
  );

  if (readOnly) {
    return <div className={rowClass}>{content}</div>;
  }

  return (
    <button
      type="button"
      aria-pressed={row.done}
      aria-busy={pending}
      aria-label={
        row.done
          ? `Undo ${row.habit.name} for ${dayLabel}`
          : `Mark ${row.habit.name} done for ${dayLabel}`
      }
      disabled={pending}
      onClick={onToggle}
      className={`${rowClass} transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {content}
    </button>
  );
}
