import { useState } from "react";
import { Link } from "react-router-dom";

import { errorMessage, isApiError } from "../api/client";
import { useArchiveHabit, useHabits } from "../api/hooks";
import type { Habit, HabitDifficulty, HabitOwner } from "../api/types";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DIFFICULTIES: Record<HabitDifficulty, { label: string; points: number }> = {
  1: { label: "Easy", points: 10 },
  2: { label: "Medium", points: 20 },
  3: { label: "Hard", points: 30 },
};

function scheduleLabel(days: number[]): string {
  if (new Set(days).size === 7) {
    return "Every day";
  }
  if (days.length === 0) {
    return "No days selected";
  }

  return [...days]
    .sort((left, right) => left - right)
    .map((day) => DAY_LABELS[day] ?? "")
    .filter(Boolean)
    .join(", ");
}

function streakLabel(streak: number): string {
  return streak === 0 ? "No streak yet" : `${streak}-day streak`;
}

function HabitGlyph({ habit }: { habit: Habit }) {
  // `Array.from` keeps astral characters (emoji) intact; `charAt(0)` would
  // return half a surrogate pair for an emoji-first name.
  const glyph = habit.emoji ?? (Array.from(habit.name.trim())[0]?.toUpperCase() || "•");

  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent/10 text-xl text-accent"
    >
      {glyph}
    </span>
  );
}

function HabitCard({
  habit,
  editable,
  onArchive,
}: {
  habit: Habit;
  editable: boolean;
  onArchive?: () => void;
}) {
  const difficulty = DIFFICULTIES[habit.difficulty];

  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <HabitGlyph habit={habit} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="break-words text-base font-semibold">{habit.name}</h3>
            <span className="rounded-pill border border-line bg-surface-raised px-2.5 py-1 text-xs font-medium text-content-muted">
              {difficulty.label} · {difficulty.points} pts
            </span>
          </div>

          <p className="mt-1 text-sm text-content-muted">{scheduleLabel(habit.schedule_days)}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">🔥</span>
              {streakLabel(habit.current_streak)}
            </span>
            <span className="text-content-subtle">Best {habit.best_streak}</span>
          </div>
        </div>
      </div>

      {editable && (
        <div className="mt-4 flex gap-2 border-t border-line pt-3">
          <Link
            to={`/habits/${habit.id}/edit`}
            aria-label={`Edit ${habit.name}`}
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-control border border-line px-3 py-2 text-sm font-semibold text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={onArchive}
            aria-label={`Archive ${habit.name}`}
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-foreground transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            Archive
          </button>
        </div>
      )}
    </article>
  );
}

function HabitsLoading() {
  return (
    <div role="status" className="mt-5 space-y-3">
      <span className="sr-only">Loading habits…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-32 animate-pulse rounded-card border border-line bg-surface-raised/60"
        />
      ))}
    </div>
  );
}

function HabitsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-card border border-line bg-surface p-5 text-center shadow-lg"
    >
      <h2 className="text-lg font-semibold">Couldn&apos;t load habits</h2>
      <p className="mt-2 text-sm text-content-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-tap items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
      >
        Retry
      </button>
    </div>
  );
}

function HabitsEmpty({ owner }: { owner: HabitOwner }) {
  return (
    <div className="mt-5 rounded-card border border-line bg-surface p-6 text-center shadow-lg">
      <h2 className="text-lg font-semibold">
        {owner === "me" ? "No habits yet" : "No partner habits yet"}
      </h2>
      <p className="mt-2 text-sm text-content-muted">
        {owner === "me"
          ? "Create a routine and pick the days it should count."
          : "When your partner adds habits, they'll appear here."}
      </p>
      {owner === "me" && (
        <Link
          to="/habits/new"
          className="mt-4 inline-flex min-h-tap items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
        >
          Create your first habit
        </Link>
      )}
    </div>
  );
}

function segmentClass(active: boolean): string {
  return [
    "min-h-tap rounded-pill px-4 py-2 text-sm font-semibold transition",
    active ? "bg-accent text-on-accent" : "text-content-muted hover:text-content",
  ].join(" ");
}

export default function HabitsPage() {
  const [owner, setOwner] = useState<HabitOwner>("me");
  const [archiveTarget, setArchiveTarget] = useState<Habit | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const habitsQuery = useHabits(owner);
  const archiveHabit = useArchiveHabit();
  const { showToast } = useToast();

  function openArchive(habit: Habit) {
    setArchiveError(null);
    setArchiveTarget(habit);
  }

  function closeArchive() {
    if (archiveHabit.isPending) {
      return;
    }
    setArchiveTarget(null);
    setArchiveError(null);
  }

  function confirmArchive() {
    if (!archiveTarget) {
      return;
    }

    setArchiveError(null);
    archiveHabit.mutate(archiveTarget.id, {
      onSuccess: () => {
        setArchiveTarget(null);
        showToast("Habit archived.", "success");
      },
      onError: (error) => {
        const message = errorMessage(error);
        setArchiveError(message);
        if (isApiError(error) && error.status === 0) {
          showToast(message);
        }
      },
    });
  }

  return (
    <section className="mx-auto max-w-2xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Routines</p>
        <h1 className="mt-2 text-2xl font-bold">Habits</h1>
        <p className="mt-2 text-sm text-content-muted">
          Define the small routines you want to repeat and see how consistent you&apos;ve been.
        </p>
      </header>

      <div
        role="group"
        aria-label="Habit owner"
        className="mt-5 inline-flex rounded-pill border border-line bg-surface p-1"
      >
        <button
          type="button"
          aria-pressed={owner === "me"}
          onClick={() => setOwner("me")}
          className={segmentClass(owner === "me")}
        >
          Mine
        </button>
        <button
          type="button"
          aria-pressed={owner === "partner"}
          onClick={() => setOwner("partner")}
          className={segmentClass(owner === "partner")}
        >
          Partner&apos;s
        </button>
      </div>

      {owner === "partner" && (
        <p className="mt-4 rounded-control border border-line bg-surface-raised px-3 py-2 text-xs text-content-muted">
          Read-only: you can see your partner&apos;s habits, not change them.
        </p>
      )}

      {habitsQuery.isPending ? (
        <HabitsLoading />
      ) : habitsQuery.isError ? (
        <HabitsError
          message={errorMessage(habitsQuery.error)}
          onRetry={() => {
            void habitsQuery.refetch();
          }}
        />
      ) : habitsQuery.data.habits.length === 0 ? (
        <HabitsEmpty owner={owner} />
      ) : (
        <div className="mt-5 space-y-3">
          {habitsQuery.data.habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              editable={owner === "me"}
              onArchive={() => openArchive(habit)}
            />
          ))}
        </div>
      )}

      {owner === "me" && (
        <Link
          to="/habits/new"
          aria-label="New habit"
          className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-pill bg-accent text-2xl font-semibold text-on-accent shadow-xl transition hover:bg-accent-hover md:bottom-8 md:right-8"
        >
          <span aria-hidden="true">+</span>
        </Link>
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={`Archive “${archiveTarget?.name ?? "habit"}”?`}
        description="It will disappear from your habit lists. Its check-ins and points stay."
        confirmLabel="Archive habit"
        pendingLabel="Archiving…"
        pending={archiveHabit.isPending}
        error={archiveError}
        onCancel={closeArchive}
        onConfirm={confirmArchive}
      />
    </section>
  );
}
