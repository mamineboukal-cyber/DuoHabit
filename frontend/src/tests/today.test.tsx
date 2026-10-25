import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type {
  CheckinResponse,
  TodayHabitRow,
  TodayResponse,
  UndoCheckinResponse,
} from "../api/types";
import { xpProgress } from "../lib/xp";
import { renderApp } from "./helpers";
import {
  checkedInToday,
  checkedInYesterday,
  coupledUser,
  emptyToday,
  server,
  todayWithHabits,
  todayWithPartner,
  yesterdayToday,
} from "./server";

function signedIn() {
  server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: coupledUser })));
}

function apiError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

function firstRow(payload: TodayResponse): TodayHabitRow {
  const row = payload.me.habits[0];
  if (!row) {
    throw new Error("Today fixture has no habits");
  }
  return row;
}

function checkinResponse(payload: TodayResponse): CheckinResponse {
  const row = firstRow(payload);
  const totalXp = payload.me.total_xp + row.points_if_done;
  const progress = xpProgress(totalXp);
  const streak = row.streak_if_done ?? row.habit.current_streak + 1;

  return {
    checkin: {
      id: 1,
      habit_id: row.habit.id,
      checkin_date: payload.date,
      points: row.points_if_done,
      streak_at_checkin: streak,
    },
    habit: {
      ...row.habit,
      current_streak: streak,
      best_streak: Math.max(row.habit.best_streak, streak),
    },
    total_xp: totalXp,
    level: progress.level,
  };
}

function undoResponse(payload: TodayResponse): UndoCheckinResponse {
  const row = firstRow(payload);
  const totalXp = Math.max(0, payload.me.total_xp - (row.checkin_points ?? 0));
  const progress = xpProgress(totalXp);

  return {
    habit: {
      ...row.habit,
      current_streak: Math.max(0, row.habit.current_streak - 1),
    },
    total_xp: totalXp,
    level: progress.level,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function openToday(payload: TodayResponse = todayWithHabits) {
  signedIn();
  server.use(http.get("*/api/today", () => HttpResponse.json(payload)));
  renderApp("/");
  await screen.findByRole("heading", { name: "Today" });
  await screen.findByText(payload.me.habits[0]?.habit.name ?? "No habits scheduled today");
}

describe("TodayPage", () => {
  it("optimistically checks in, shows +XP and level-up confetti, then settles", async () => {
    const user = userEvent.setup();
    const postGate = deferred();
    let today = todayWithHabits;
    let posted: unknown;

    signedIn();
    server.use(
      http.get("*/api/today", () => HttpResponse.json(today)),
      http.post("*/api/habits/31/checkins", async ({ request }) => {
        posted = await request.json();
        await postGate.promise;
        today = checkedInToday;
        return HttpResponse.json(checkinResponse(todayWithHabits), { status: 201 });
      }),
    );

    renderApp("/");
    await screen.findByRole("heading", { name: "Today" });
    await screen.findByText("Run");
    expect(screen.queryByTestId("confetti")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark Run done for today" }));

    expect(screen.getByText("+11 XP")).toBeInTheDocument();
    expect(screen.getByText("+11 XP")).toHaveClass("motion-reduce:animate-none");
    expect(await screen.findByRole("button", { name: "Undo Run for today" })).toBeInTheDocument();
    expect(screen.getByTestId("confetti")).toHaveClass("motion-reduce:hidden");
    await waitFor(() => expect(posted).toEqual({ date: "2026-10-23" }));

    postGate.resolve();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo Run for today" })).not.toBeDisabled(),
    );
    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(screen.getAllByText("+11").length).toBeGreaterThan(0);
  });

  it("rolls back the optimistic check-in on a 500 and shows a toast", async () => {
    const user = userEvent.setup();
    const errorGate = deferred();

    signedIn();
    server.use(
      http.get("*/api/today", () => HttpResponse.json(todayWithHabits)),
      http.post("*/api/habits/31/checkins", async () => {
        await errorGate.promise;
        return apiError("internal_error", "Could not save the check-in.", 500);
      }),
    );

    renderApp("/");
    await screen.findByText("Run");

    await user.click(screen.getByRole("button", { name: "Mark Run done for today" }));

    expect(await screen.findByRole("button", { name: "Undo Run for today" })).toBeInTheDocument();

    errorGate.resolve();

    expect(await screen.findByText("Could not save the check-in.")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Mark Run done for today" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo Run for today" })).not.toBeInTheDocument();
    expect(screen.queryByText("Level 2")).not.toBeInTheDocument();
  });

  it("rolls back when the server rejects a duplicate check-in with 409", async () => {
    const user = userEvent.setup();

    signedIn();
    server.use(
      http.get("*/api/today", () => HttpResponse.json(todayWithHabits)),
      http.post("*/api/habits/31/checkins", () =>
        apiError("already_checked_in", "You already checked in for today.", 409),
      ),
    );

    renderApp("/");
    await screen.findByText("Run");

    await user.click(screen.getByRole("button", { name: "Mark Run done for today" }));

    expect(await screen.findByText("You already checked in for today.")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Mark Run done for today" }),
    ).toBeInTheDocument();
  });

  it("optimistically undoes a check-in and settles with the server response", async () => {
    const user = userEvent.setup();
    const deleteGate = deferred();
    let today = checkedInToday;

    signedIn();
    server.use(
      http.get("*/api/today", () => HttpResponse.json(today)),
      http.delete("*/api/habits/31/checkins/2026-10-23", async () => {
        await deleteGate.promise;
        today = todayWithHabits;
        return HttpResponse.json(undoResponse(checkedInToday));
      }),
    );

    renderApp("/");
    await screen.findByText("Run");
    await screen.findByText("Level 2");

    await user.click(screen.getByRole("button", { name: "Undo Run for today" }));

    expect(
      await screen.findByRole("button", { name: "Mark Run done for today" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Level 2")).not.toBeInTheDocument();

    deleteGate.resolve();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark Run done for today" })).not.toBeDisabled(),
    );
    expect(screen.getByText("Level 1")).toBeInTheDocument();
  });

  it("shows the partner section read-only with level and points", async () => {
    await openToday(todayWithPartner);

    const partner = await screen.findByRole("region", { name: "Partner" });

    expect(within(partner).getByText("Stretch")).toBeInTheDocument();
    expect(within(partner).getByText("Level 2")).toBeInTheDocument();
    expect(within(partner).getByText("20 pts today")).toBeInTheDocument();
    expect(within(partner).getByText("Read-only")).toBeInTheDocument();
    expect(within(partner).getByText("Done")).toBeInTheDocument();
    expect(within(partner).queryAllByRole("button")).toHaveLength(0);
  });

  it("invites a partner when none has joined yet", async () => {
    await openToday(todayWithHabits);

    expect(await screen.findByText("Waiting for your partner to join")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invite your partner" })).toHaveAttribute(
      "href",
      "/pair",
    );
  });

  it("shows the empty state with a create link when nothing is scheduled", async () => {
    await openToday(emptyToday);

    expect(
      await screen.findByRole("heading", { name: "No habits scheduled today" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a habit" })).toHaveAttribute(
      "href",
      "/habits/new",
    );
  });

  it("shows a loading state while the dashboard request is pending", async () => {
    const getGate = deferred();

    signedIn();
    server.use(
      http.get("*/api/today", async () => {
        await getGate.promise;
        return HttpResponse.json(todayWithHabits);
      }),
    );

    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading today");

    getGate.resolve();

    expect(await screen.findByText("Run")).toBeInTheDocument();
  });

  it("shows an error with Retry and recovers", async () => {
    const user = userEvent.setup();
    let calls = 0;

    signedIn();
    server.use(
      http.get("*/api/today", () => {
        calls += 1;
        return calls === 1
          ? apiError("internal_error", "The server is unavailable.", 500)
          : HttpResponse.json(todayWithHabits);
      }),
    );

    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load today");
    expect(screen.getByRole("alert")).toHaveTextContent("The server is unavailable.");

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Run")).toBeInTheDocument();
  });

  it("shows yesterday's state and sends the selected date on check-in", async () => {
    const user = userEvent.setup();
    const today = todayWithHabits;
    let yesterday = yesterdayToday;
    let posted: unknown;

    signedIn();
    server.use(
      http.get("*/api/today", ({ request }) => {
        const date = new URL(request.url).searchParams.get("date");
        return HttpResponse.json(date === "2026-10-22" ? yesterday : today);
      }),
      http.post("*/api/habits/32/checkins", async ({ request }) => {
        posted = await request.json();
        yesterday = checkedInYesterday;
        return HttpResponse.json(checkinResponse(yesterdayToday), { status: 201 });
      }),
    );

    renderApp("/");
    await screen.findByText("Run");
    await user.click(screen.getByRole("button", { name: "Yesterday" }));

    expect(await screen.findByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
    expect(await screen.findByText("Read")).toBeInTheDocument();
    expect(screen.getByText("points yesterday")).toBeInTheDocument();
    expect(screen.getAllByText("+20").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Mark Read done for yesterday" }));

    await waitFor(() => expect(posted).toEqual({ date: "2026-10-22" }));
    expect(
      await screen.findByRole("button", { name: "Undo Read for yesterday" }),
    ).toBeInTheDocument();
  });

  it("polls the dashboard every 15 seconds", async () => {
    let calls = 0;
    const polledToday: TodayResponse = {
      ...todayWithPartner,
      partner: todayWithPartner.partner ? { ...todayWithPartner.partner, today_points: 40 } : null,
    };

    signedIn();
    server.use(
      http.get("*/api/today", () => {
        calls += 1;
        return HttpResponse.json(calls === 1 ? todayWithPartner : polledToday);
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/");
      expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
      expect(await screen.findByText("20 pts today")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(await screen.findByText("40 pts today")).toBeInTheDocument();
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an in-flight poll overwrite an optimistic check-in", async () => {
    const pollGate = deferred();
    const postGate = deferred();
    let calls = 0;
    let today = todayWithHabits;

    signedIn();
    server.use(
      http.get("*/api/today", async () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(todayWithHabits);
        }
        if (calls === 2) {
          await pollGate.promise;
          return HttpResponse.json(todayWithHabits);
        }
        return HttpResponse.json(today);
      }),
      http.post("*/api/habits/31/checkins", async () => {
        await postGate.promise;
        today = checkedInToday;
        return HttpResponse.json(checkinResponse(todayWithHabits), { status: 201 });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/");
      expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
      expect(await screen.findByText("Run")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));

      fireEvent.click(screen.getByRole("button", { name: "Mark Run done for today" }));
      expect(await screen.findByRole("button", { name: "Undo Run for today" })).toBeInTheDocument();

      pollGate.resolve();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("button", { name: "Undo Run for today" })).toBeInTheDocument();

      postGate.resolve();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Undo Run for today" })).not.toBeDisabled(),
      );
      expect(screen.getByText("Level 2")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
