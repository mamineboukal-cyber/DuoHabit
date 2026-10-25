import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../api/client";
import { useCreateCheckin, useToday, useUndoCheckin } from "../api/hooks";
import type { TodayHabitRow, TodayMember } from "../api/types";
import Confetti from "../components/Confetti";
import HabitRow from "../components/HabitRow";
import { useToast } from "../components/Toast";
import XpBar from "../components/XpBar";
import { addDaysIso, formatDisplayDate } from "../lib/dates";

type DayView = "today" | "yesterday";

const XP_FEEDBACK_MS = 1200;
const CELEBRATION_MS = 2200;

function segmentClass(active: boolean): string {
  return [
    "min-h-tap rounded-pill px-4 py-2 text-sm font-semibold transition",
    active ? "bg-accent text-on-accent" : "text-content-muted hover:text-content",
  ].join(" ");
}

function TodayLoading({ label }: { label: string }) {
  return (
    <div role="status" className="mt-5 space-y-4">
      <span className="sr-only">Loading {label}…</span>
      <div className="h-28 animate-pulse rounded-card border border-line bg-surface-raised/60" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-card border border-line bg-surface-raised/60" />
        <div className="h-44 animate-pulse rounded-card border border-line bg-surface-raised/60" />
      </div>
    </div>
  );
}

function TodayError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-card border border-line bg-surface p-5 text-center shadow-lg"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
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

function TodaySummary({ member, view }: { member: TodayMember; view: DayView }) {
  return (
    <div className="mt-5 rounded-card border border-line bg-surface p-5 shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="sm:w-36">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-content-muted">
            Your progress
          </p>
          <p className="mt-1 text-3xl font-bold text-success">+{member.today_points}</p>
          <p className="text-xs text-content-muted">
            points {view === "today" ? "today" : "yesterday"}
          </p>
        </div>
        <XpBar
          level={member.level}
          xpIntoLevel={member.xp_into_level}
          xpForNextLevel={member.xp_for_next_level}
        />
      </div>
    </div>
  );
}

function PartnerSummary({ member, view }: { member: TodayMember; view: DayView }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{member.user.display_name}</span>
      <span className="rounded-pill bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
        Level {member.level}
      </span>
      <span className="text-content-muted">
        {member.today_points} pts {view === "today" ? "today" : "yesterday"}
      </span>
      <span className="rounded-pill border border-line bg-surface-raised px-2 py-0.5 text-xs text-content-muted">
        Read-only
      </span>
    </div>
  );
}

function MemberSection({
  id,
  title,
  member,
  view,
  readOnly = false,
  pending = false,
  xpGain,
  onToggle,
}: {
  id: string;
  title: string;
  member: TodayMember;
  view: DayView;
  readOnly?: boolean;
  pending?: boolean;
  xpGain?: { habitId: number; points: number } | null;
  onToggle?: (row: TodayHabitRow) => void;
}) {
  const dayLabel = view === "today" ? "today" : "yesterday";
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>

      {readOnly && <PartnerSummary member={member} view={view} />}

      {member.habits.length === 0 ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-6 text-center shadow-lg">
          <h3 className="text-base font-semibold">
            {readOnly
              ? `No partner habits scheduled ${dayLabel}`
              : view === "today"
                ? "No habits scheduled today"
                : "No habits were scheduled yesterday"}
          </h3>
          <p className="mt-2 text-sm text-content-muted">
            {readOnly
              ? `When your partner has a habit scheduled for ${dayLabel}, it will appear here.`
              : view === "today"
                ? "Add a routine to start earning points together."
                : "You can switch back to Today to see what is scheduled now."}
          </p>
          {!readOnly && view === "today" && (
            <Link
              to="/habits/new"
              className="mt-4 inline-flex min-h-tap items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
            >
              Create a habit
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {member.habits.map((row) => (
            <HabitRow
              key={row.habit.id}
              row={row}
              dayLabel={dayLabel}
              readOnly={readOnly}
              pending={readOnly ? false : pending}
              xpGain={!readOnly && xpGain?.habitId === row.habit.id ? xpGain.points : null}
              onToggle={!readOnly && onToggle ? () => onToggle(row) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartnerEmpty() {
  return (
    <section aria-labelledby="partner-heading">
      <h2 id="partner-heading" className="text-lg font-semibold">
        Partner
      </h2>
      <div className="mt-3 rounded-card border border-line bg-surface p-6 text-center shadow-lg">
        <h3 className="text-base font-semibold">Waiting for your partner to join</h3>
        <p className="mt-2 text-sm text-content-muted">
          Share your invite code and their progress will appear here.
        </p>
        <Link
          to="/pair"
          className="mt-4 inline-flex min-h-tap items-center justify-center rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
        >
          Invite your partner
        </Link>
      </div>
    </section>
  );
}

export default function TodayPage() {
  const [view, setView] = useState<DayView>("today");
  const [yesterdayDate, setYesterdayDate] = useState<string | null>(null);
  const [xpGain, setXpGain] = useState<{ habitId: number; points: number } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const previousLevel = useRef<number | null>(null);
  const xpTimer = useRef<number | null>(null);
  const celebrationTimer = useRef<number | null>(null);
  const createCheckin = useCreateCheckin();
  const undoCheckin = useUndoCheckin();
  const { showToast } = useToast();

  const isMutating = createCheckin.isPending || undoCheckin.isPending;
  const selectedDate = view === "yesterday" ? (yesterdayDate ?? undefined) : undefined;
  const todayQuery = useToday(selectedDate, {
    enabled: view === "today" || Boolean(yesterdayDate),
    poll: !isMutating,
  });
  const data = todayQuery.data;
  const level = data?.me.level;
  const dayLabel = view === "today" ? "today" : "yesterday";
  const displayDate = data?.date ?? (view === "yesterday" ? yesterdayDate : undefined);
  const canSelectYesterday = view === "yesterday" || Boolean(data?.date);

  useEffect(() => {
    return () => {
      if (xpTimer.current !== null) {
        window.clearTimeout(xpTimer.current);
      }
      if (celebrationTimer.current !== null) {
        window.clearTimeout(celebrationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (level === undefined) {
      return;
    }
    if (previousLevel.current === null) {
      previousLevel.current = level;
      return;
    }
    if (level > previousLevel.current) {
      setCelebrate(true);
      if (celebrationTimer.current !== null) {
        window.clearTimeout(celebrationTimer.current);
      }
      celebrationTimer.current = window.setTimeout(() => setCelebrate(false), CELEBRATION_MS);
    }
    previousLevel.current = level;
  }, [level]);

  function selectToday() {
    setView("today");
  }

  function selectYesterday() {
    if (view === "yesterday") {
      return;
    }
    const todayDate = data?.date;
    if (!todayDate) {
      return;
    }
    setYesterdayDate(addDaysIso(todayDate, -1));
    setView("yesterday");
  }

  function clearXpGain() {
    setXpGain(null);
    if (xpTimer.current !== null) {
      window.clearTimeout(xpTimer.current);
      xpTimer.current = null;
    }
  }

  function showXpGain(habitId: number, points: number) {
    setXpGain({ habitId, points });
    if (xpTimer.current !== null) {
      window.clearTimeout(xpTimer.current);
    }
    xpTimer.current = window.setTimeout(() => setXpGain(null), XP_FEEDBACK_MS);
  }

  function handleToggle(row: TodayHabitRow) {
    if (!data) {
      return;
    }

    const variables = {
      habitId: row.habit.id,
      date: data.date,
      queryDate: selectedDate,
    };

    if (row.done) {
      undoCheckin.mutate(variables, {
        onError: (error) => showToast(errorMessage(error)),
      });
      return;
    }

    showXpGain(row.habit.id, row.points_if_done);
    createCheckin.mutate(variables, {
      onError: (error) => {
        clearXpGain();
        showToast(errorMessage(error));
      },
    });
  }

  return (
    <section className="mx-auto max-w-content">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Daily check-in
        </p>
        <h1 className="mt-2 text-2xl font-bold">{view === "today" ? "Today" : "Yesterday"}</h1>
        <p className="mt-2 text-sm text-content-muted">
          {displayDate ? formatDisplayDate(displayDate) : "Loading your day…"}
        </p>
      </header>

      <div
        role="group"
        aria-label="Check-in day"
        className="mt-5 inline-flex rounded-pill border border-line bg-surface p-1"
      >
        <button
          type="button"
          aria-pressed={view === "today"}
          onClick={selectToday}
          className={segmentClass(view === "today")}
        >
          Today
        </button>
        <button
          type="button"
          aria-pressed={view === "yesterday"}
          onClick={selectYesterday}
          disabled={!canSelectYesterday}
          className={`${segmentClass(view === "yesterday")} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Yesterday
        </button>
      </div>

      {todayQuery.isPending ? (
        <TodayLoading label={dayLabel} />
      ) : todayQuery.isError && !data ? (
        <TodayError
          title={`Couldn't load ${dayLabel}`}
          message={errorMessage(todayQuery.error)}
          onRetry={() => {
            void todayQuery.refetch();
          }}
        />
      ) : data ? (
        <>
          {todayQuery.isError && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-foreground"
            >
              <span>Couldn&apos;t refresh {dayLabel}.</span>
              <button
                type="button"
                onClick={() => {
                  void todayQuery.refetch();
                }}
                className="min-h-tap rounded-control px-2 font-semibold text-danger-foreground underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          <TodaySummary member={data.me} view={view} />

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <MemberSection
              id="me"
              title="Me"
              member={data.me}
              view={view}
              pending={isMutating}
              xpGain={xpGain}
              onToggle={handleToggle}
            />
            {data.partner ? (
              <MemberSection
                id="partner"
                title="Partner"
                member={data.partner}
                view={view}
                readOnly
              />
            ) : (
              <PartnerEmpty />
            )}
          </div>
        </>
      ) : null}

      {celebrate && <Confetti />}
    </section>
  );
}
