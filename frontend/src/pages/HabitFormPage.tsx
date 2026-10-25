import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage, fieldErrors, isApiError } from "../api/client";
import { useArchiveHabit, useCreateHabit, useHabits, useUpdateHabit } from "../api/hooks";
import type { Habit, HabitDifficulty } from "../api/types";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { habitFormSchema, zodFieldErrors } from "../lib/validation";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DAY_OPTIONS = [
  { value: 0, short: "Mon", label: "Monday" },
  { value: 1, short: "Tue", label: "Tuesday" },
  { value: 2, short: "Wed", label: "Wednesday" },
  { value: 3, short: "Thu", label: "Thursday" },
  { value: 4, short: "Fri", label: "Friday" },
  { value: 5, short: "Sat", label: "Saturday" },
  { value: 6, short: "Sun", label: "Sunday" },
] as const;

const DIFFICULTY_OPTIONS: Array<{ value: HabitDifficulty; label: string; points: number }> = [
  { value: 1, label: "Easy", points: 10 },
  { value: 2, label: "Medium", points: 20 },
  { value: 3, label: "Hard", points: 30 },
];

const SERVER_FIELDS = new Set(["name", "emoji", "difficulty", "schedule_days"]);

const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-tap items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-tap items-center justify-center rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-content-muted transition hover:border-line-strong hover:text-content disabled:cursor-not-allowed disabled:opacity-60";

function inputClass(hasError: boolean): string {
  return [
    "min-h-tap w-full rounded-control border bg-canvas/60 px-3 py-2 text-base text-content",
    "placeholder:text-content-subtle focus:outline-none",
    hasError ? "border-danger" : "border-line focus:border-accent",
  ].join(" ");
}

function HabitForm({ habit }: { habit?: Habit }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();

  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "");
  const [difficulty, setDifficulty] = useState<HabitDifficulty>(habit?.difficulty ?? 1);
  const [scheduleDays, setScheduleDays] = useState<number[]>(() =>
    habit ? [...habit.schedule_days] : [...ALL_DAYS],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const isSaving = createHabit.isPending || updateHabit.isPending;

  function clearError(field: string) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function toggleDay(day: number) {
    setScheduleDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
    clearError("schedule_days");
  }

  function handleServerError(error: unknown) {
    if (isApiError(error) && error.code === "habit_name_taken") {
      setErrors({ name: error.message });
      return;
    }

    const details = fieldErrors(error);
    const knownFields = Object.fromEntries(
      Object.entries(details).filter(([field]) => SERVER_FIELDS.has(field)),
    );
    if (Object.keys(knownFields).length > 0) {
      setErrors(knownFields);
      return;
    }

    const message = errorMessage(error);
    if (isApiError(error) && error.status === 0) {
      showToast(message);
      return;
    }
    setFormError(message);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = habitFormSchema.safeParse({
      name,
      emoji,
      difficulty,
      schedule_days: scheduleDays,
    });
    if (!result.success) {
      setErrors(zodFieldErrors(result.error));
      return;
    }

    setErrors({});
    if (habit) {
      updateHabit.mutate(
        { id: habit.id, body: result.data },
        {
          onSuccess: () => {
            showToast("Habit saved.", "success");
            navigate("/habits", { replace: true });
          },
          onError: handleServerError,
        },
      );
      return;
    }

    createHabit.mutate(result.data, {
      onSuccess: () => {
        showToast("Habit created.", "success");
        navigate("/habits", { replace: true });
      },
      onError: handleServerError,
    });
  }

  function closeArchive() {
    if (archiveHabit.isPending) {
      return;
    }
    setArchiveOpen(false);
    setArchiveError(null);
  }

  function confirmArchive() {
    if (!habit) {
      return;
    }

    setArchiveError(null);
    archiveHabit.mutate(habit.id, {
      onSuccess: () => {
        setArchiveOpen(false);
        showToast("Habit archived.", "success");
        navigate("/habits", { replace: true });
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
    <>
      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-card border border-line bg-surface p-5 shadow-xl"
      >
        <div>
          <label
            htmlFor="habit-name"
            className="mb-1.5 block text-sm font-medium text-content-muted"
          >
            Name
          </label>
          <input
            id="habit-name"
            name="name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError("name");
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "habit-name-error" : "habit-name-hint"}
            className={inputClass(Boolean(errors.name))}
          />
          {errors.name ? (
            <p id="habit-name-error" className="mt-1 text-sm text-danger-foreground">
              {errors.name}
            </p>
          ) : (
            <p id="habit-name-hint" className="mt-1 text-xs text-content-subtle">
              Up to 60 characters.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="habit-emoji"
            className="mb-1.5 block text-sm font-medium text-content-muted"
          >
            Emoji
          </label>
          <input
            id="habit-emoji"
            name="emoji"
            type="text"
            autoComplete="off"
            value={emoji}
            onChange={(event) => {
              setEmoji(event.target.value);
              clearError("emoji");
            }}
            aria-invalid={Boolean(errors.emoji)}
            aria-describedby={errors.emoji ? "habit-emoji-error" : "habit-emoji-hint"}
            className={inputClass(Boolean(errors.emoji))}
          />
          {errors.emoji ? (
            <p id="habit-emoji-error" className="mt-1 text-sm text-danger-foreground">
              {errors.emoji}
            </p>
          ) : (
            <p id="habit-emoji-hint" className="mt-1 text-xs text-content-subtle">
              Optional, up to 8 characters.
            </p>
          )}
        </div>

        <fieldset aria-describedby={errors.difficulty ? "habit-difficulty-error" : undefined}>
          <legend className="text-sm font-medium text-content-muted">Difficulty</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {DIFFICULTY_OPTIONS.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="difficulty"
                  value={option.value}
                  checked={difficulty === option.value}
                  onChange={() => {
                    setDifficulty(option.value);
                    clearError("difficulty");
                  }}
                  className="peer sr-only"
                />
                <span className="flex min-h-tap flex-col justify-center rounded-control border border-line bg-canvas/40 px-3 py-3 transition peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 text-xs text-content-muted">
                    {option.points} base points
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errors.difficulty && (
            <p
              id="habit-difficulty-error"
              role="alert"
              className="mt-1 text-sm text-danger-foreground"
            >
              {errors.difficulty}
            </p>
          )}
        </fieldset>

        <fieldset
          aria-describedby={errors.schedule_days ? "habit-schedule-error" : "habit-schedule-hint"}
        >
          <legend className="text-sm font-medium text-content-muted">Days</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <label key={day.value} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="schedule_days"
                  value={day.value}
                  checked={scheduleDays.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                  aria-label={day.label}
                  className="peer sr-only"
                />
                <span className="flex min-h-tap min-w-11 items-center justify-center rounded-pill border border-line px-3 text-sm font-medium text-content-muted transition peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
                  {day.short}
                </span>
              </label>
            ))}
          </div>
          {errors.schedule_days ? (
            <p
              id="habit-schedule-error"
              role="alert"
              className="mt-1 text-sm text-danger-foreground"
            >
              {errors.schedule_days}
            </p>
          ) : (
            <p id="habit-schedule-hint" className="mt-1 text-xs text-content-subtle">
              Pick at least one day.
            </p>
          )}
        </fieldset>

        {formError && (
          <p
            role="alert"
            className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground"
          >
            {formError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/habits" className={SECONDARY_BUTTON_CLASS}>
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving || archiveHabit.isPending}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {habit && (
        <section className="mt-6 rounded-card border border-danger/30 bg-danger-soft/20 p-5">
          <h2 className="text-base font-semibold">Archive habit</h2>
          <p className="mt-1 text-sm text-content-muted">
            It disappears from your lists. Its check-ins and points stay.
          </p>
          <button
            type="button"
            onClick={() => {
              setArchiveError(null);
              setArchiveOpen(true);
            }}
            disabled={isSaving}
            className="mt-3 inline-flex min-h-tap items-center justify-center rounded-control border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger-foreground transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            Archive habit
          </button>
        </section>
      )}

      <ConfirmDialog
        open={archiveOpen && habit !== undefined}
        title={`Archive “${habit?.name ?? "habit"}”?`}
        description="It will disappear from your habit lists. Its check-ins and points stay."
        confirmLabel="Archive habit"
        pendingLabel="Archiving…"
        pending={archiveHabit.isPending}
        error={archiveError}
        onCancel={closeArchive}
        onConfirm={confirmArchive}
      />
    </>
  );
}

function FormLoading() {
  return (
    <div role="status" className="mt-6 space-y-3">
      <span className="sr-only">Loading habit…</span>
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-card border border-line bg-surface-raised/60"
      />
    </div>
  );
}

function FormError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-card border border-line bg-surface p-5 text-center shadow-lg"
    >
      <h2 className="text-lg font-semibold">Couldn&apos;t load this habit</h2>
      <p className="mt-2 text-sm text-content-muted">{message}</p>
      <button type="button" onClick={onRetry} className={`${PRIMARY_BUTTON_CLASS} mt-4`}>
        Retry
      </button>
    </div>
  );
}

function HabitNotFound() {
  return (
    <div className="mt-6 rounded-card border border-line bg-surface p-6 text-center shadow-lg">
      <h2 className="text-lg font-semibold">Habit not found</h2>
      <p className="mt-2 text-sm text-content-muted">
        It may have been archived, or it belongs to someone else.
      </p>
      <Link to="/habits" className={`${PRIMARY_BUTTON_CLASS} mt-4`}>
        Back to habits
      </Link>
    </div>
  );
}

export default function HabitFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined;
  const habitsQuery = useHabits("me", { enabled: isEdit });

  let body: ReactNode;
  if (!isEdit) {
    body = <HabitForm key="new" />;
  } else if (habitsQuery.isPending) {
    body = <FormLoading />;
  } else if (habitsQuery.isError) {
    body = (
      <FormError
        message={errorMessage(habitsQuery.error)}
        onRetry={() => {
          void habitsQuery.refetch();
        }}
      />
    );
  } else {
    const habit = habitsQuery.data.habits.find((candidate) => String(candidate.id) === id);
    body = habit ? <HabitForm key={habit.id} habit={habit} /> : <HabitNotFound />;
  }

  return (
    <section className="mx-auto max-w-2xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Habits</p>
        <h1 className="mt-2 text-2xl font-bold">{isEdit ? "Edit habit" : "New habit"}</h1>
        <p className="mt-2 text-sm text-content-muted">
          {isEdit
            ? "Change the details or archive it if it no longer fits."
            : "Give the routine a name and choose when it should count."}
        </p>
      </header>

      {body}
    </section>
  );
}
