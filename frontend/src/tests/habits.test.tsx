import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { Habit } from "../api/types";
import { renderApp } from "./helpers";
import { coupledUser, myHabit, partnerHabit, server } from "./server";

function signedIn() {
  server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: coupledUser })));
}

function mockHabits(me: Habit[] = [], partner: Habit[] = []) {
  server.use(
    http.get("*/api/habits", ({ request }) => {
      const owner = new URL(request.url).searchParams.get("owner");
      return HttpResponse.json({ habits: owner === "partner" ? partner : me });
    }),
  );
}

async function openHabits() {
  signedIn();
  renderApp("/habits");
  await screen.findByRole("heading", { name: "Habits" });
}

async function openNewHabit() {
  signedIn();
  renderApp("/habits/new");
  await screen.findByRole("heading", { name: "New habit" });
}

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

describe("HabitsPage", () => {
  it("lists my habits with their schedule, streak and owner controls", async () => {
    mockHabits([myHabit]);
    await openHabits();

    expect(await screen.findByText("Run")).toBeInTheDocument();
    expect(screen.getByText("Mon, Wed, Fri")).toBeInTheDocument();
    expect(screen.getByText("Easy · 10 pts")).toBeInTheDocument();
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(screen.getByText("Best 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Run" })).toHaveAttribute(
      "href",
      "/habits/21/edit",
    );
    expect(screen.getByRole("button", { name: "Archive Run" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New habit" })).toHaveAttribute("href", "/habits/new");
  });

  it("renders the partner's habits with no edit, archive or create controls", async () => {
    const user = userEvent.setup();
    mockHabits([myHabit], [partnerHabit]);
    await openHabits();

    await screen.findByText("Run");
    await user.click(screen.getByRole("button", { name: "Partner's" }));

    expect(await screen.findByText("Stretch")).toBeInTheDocument();
    expect(screen.getByText("Every day")).toBeInTheDocument();
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Archive / })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New habit" })).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });

  it("shows the mine and partner empty states", async () => {
    const user = userEvent.setup();
    mockHabits();
    await openHabits();

    expect(await screen.findByRole("heading", { name: "No habits yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first habit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New habit" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Partner's" }));

    expect(
      await screen.findByRole("heading", { name: "No partner habits yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/When your partner adds habits/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create your first habit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New habit" })).not.toBeInTheDocument();
  });

  it("opens the new habit form from the floating add button", async () => {
    const user = userEvent.setup();
    mockHabits([myHabit]);
    await openHabits();

    await screen.findByText("Run");
    await user.click(screen.getByRole("link", { name: "New habit" }));

    expect(await screen.findByRole("heading", { name: "New habit" })).toBeInTheDocument();
  });

  it("confirms before archiving from the list and refreshes the list", async () => {
    const user = userEvent.setup();
    let habits: Habit[] = [myHabit];
    let deletes = 0;
    server.use(
      http.get("*/api/habits", () => HttpResponse.json({ habits })),
      http.delete("*/api/habits/21", () => {
        deletes += 1;
        habits = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await openHabits();

    expect(await screen.findByText("Run")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive Run" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Archive “Run”?" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletes).toBe(0);

    await user.click(screen.getByRole("button", { name: "Archive Run" }));
    const confirmDialog = await screen.findByRole("dialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "Archive habit" }));

    await waitFor(() => expect(deletes).toBe(1));
    expect(await screen.findByText("Habit archived.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No habits yet" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error with retry when the habit list fails", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get("*/api/habits", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { error: { code: "internal_error", message: "Unexpected error." } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ habits: [myHabit] });
      }),
    );
    await openHabits();

    expect(
      await screen.findByRole("heading", { name: "Couldn't load habits" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Run")).toBeInTheDocument();
  });
});

describe("HabitFormPage", () => {
  it("shows the limits and requires a name and at least one weekday", async () => {
    const user = userEvent.setup();
    const post = vi.fn();
    server.use(
      http.post("*/api/habits", () => {
        post();
        return HttpResponse.json({ habit: myHabit }, { status: 201 });
      }),
    );
    await openNewHabit();

    expect(screen.getByText(/up to 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText("Up to 60 characters.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Habit name is required.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "Run");
    for (const day of DAY_LABELS) {
      await user.click(screen.getByRole("checkbox", { name: day }));
    }
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick at least one day.");
    expect(post).not.toHaveBeenCalled();
  });

  it("counts the name and emoji limits in Unicode code points", async () => {
    const user = userEvent.setup();
    const post = vi.fn();
    server.use(
      http.post("*/api/habits", () => {
        post();
        return HttpResponse.json({ habit: myHabit }, { status: 201 });
      }),
    );
    await openNewHabit();

    const nameInput = screen.getByLabelText("Name");
    const emojiInput = screen.getByLabelText("Emoji");

    fireEvent.change(nameInput, { target: { value: "😀".repeat(61) } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Habit name must be 60 characters or fewer."),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: "😀".repeat(60) } });
    fireEvent.change(emojiInput, { target: { value: "😀".repeat(9) } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Emoji must be 8 characters or fewer.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(emojiInput, { target: { value: "😀".repeat(8) } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("creates a habit with the selected difficulty and weekdays", async () => {
    const user = userEvent.setup();
    let body: unknown;
    const created: Habit = {
      ...myHabit,
      name: "Read 20 pages",
      emoji: "📚",
      difficulty: 3,
      schedule_days: [2, 3, 4, 5, 6],
    };
    server.use(
      http.post("*/api/habits", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ habit: created }, { status: 201 });
      }),
    );
    mockHabits([created]);
    await openNewHabit();

    await user.type(screen.getByLabelText("Name"), "Read 20 pages");
    fireEvent.change(screen.getByLabelText("Emoji"), { target: { value: "📚" } });
    await user.click(screen.getByRole("radio", { name: /Hard/ }));
    await user.click(screen.getByRole("checkbox", { name: "Monday" }));
    await user.click(screen.getByRole("checkbox", { name: "Tuesday" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(body).toEqual({
        name: "Read 20 pages",
        emoji: "📚",
        difficulty: 3,
        schedule_days: [2, 3, 4, 5, 6],
      }),
    );
    expect(await screen.findByText("Habit created.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
    expect(await screen.findByText("Read 20 pages")).toBeInTheDocument();
  });

  it("loads the habit for editing, saves changes and shows the success toast", async () => {
    const user = userEvent.setup();
    let patched: unknown;
    let current = myHabit;
    server.use(
      http.get("*/api/habits", () => HttpResponse.json({ habits: [current] })),
      http.patch("*/api/habits/21", async ({ request }) => {
        patched = await request.json();
        current = { ...myHabit, ...(patched as Partial<Habit>) };
        return HttpResponse.json({ habit: current });
      }),
    );
    signedIn();
    renderApp("/habits/21/edit");

    expect(await screen.findByRole("heading", { name: "Edit habit" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue("Run");
    expect(screen.getByLabelText("Emoji")).toHaveValue("🏃");
    expect(screen.getByRole("radio", { name: /Easy/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tuesday" })).not.toBeChecked();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Run 5K");
    await user.click(screen.getByRole("radio", { name: /Medium/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(patched).toEqual({
        name: "Run 5K",
        emoji: "🏃",
        difficulty: 2,
        schedule_days: [0, 2, 4],
      }),
    );
    expect(await screen.findByText("Habit saved.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
    expect(await screen.findByText("Run 5K")).toBeInTheDocument();
  });

  it("archives from the edit page after confirmation", async () => {
    const user = userEvent.setup();
    let habits: Habit[] = [myHabit];
    let deletes = 0;
    server.use(
      http.get("*/api/habits", () => HttpResponse.json({ habits })),
      http.delete("*/api/habits/21", () => {
        deletes += 1;
        habits = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    signedIn();
    renderApp("/habits/21/edit");

    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Archive habit" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive habit" }));

    await waitFor(() => expect(deletes).toBe(1));
    expect(await screen.findByText("Habit archived.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
  });

  it("shows field-level server errors on the form", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/habits", () =>
        HttpResponse.json(
          {
            error: {
              code: "habit_name_taken",
              message: "You already have an active habit with that name.",
            },
          },
          { status: 409 },
        ),
      ),
    );
    await openNewHabit();

    await user.type(screen.getByLabelText("Name"), "Run");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("You already have an active habit with that name."),
    ).toBeInTheDocument();

    server.use(
      http.post("*/api/habits", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Invalid request data.",
              details: {
                name: "Habit name must be 60 characters or fewer.",
                schedule_days: "Pick at least one day.",
              },
            },
          },
          { status: 422 },
        ),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Habit name must be 60 characters or fewer."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick at least one day.");
  });

  it("shows not found when the edit id is not in the active list", async () => {
    mockHabits();
    signedIn();
    renderApp("/habits/999/edit");

    expect(await screen.findByRole("heading", { name: "Habit not found" })).toBeInTheDocument();
  });
});
