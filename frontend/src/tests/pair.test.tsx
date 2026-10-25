import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { Couple, User } from "../api/types";
import { renderApp } from "./helpers";
import { coupledUser, defaultUser, fullCouple, server, soloCouple } from "./server";

function signedIn(user: User = defaultUser) {
  server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user })));
}

function coupleResponse(couple: Couple) {
  server.use(http.get("*/api/couple", () => HttpResponse.json({ couple })));
}

function apiError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

async function openPair() {
  renderApp("/pair");
  await screen.findByRole("heading", { name: "Pair with your partner" });
}

describe("PairPage", () => {
  it("shows both cards and the default timezone without a couple", async () => {
    signedIn(defaultUser);
    await openPair();

    expect(screen.getByRole("heading", { name: "Create our couple" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Join with a code" })).toBeInTheDocument();
    expect(screen.getByLabelText("Couple timezone")).toHaveValue("Africa/Casablanca");
  });

  it("creates a couple with the chosen timezone and shows the invite code", async () => {
    const user = userEvent.setup();
    let body: unknown;
    signedIn(defaultUser);
    server.use(
      http.post("*/api/couple", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ couple: soloCouple }, { status: 201 });
      }),
    );

    await openPair();
    await user.selectOptions(screen.getByLabelText("Couple timezone"), "Europe/Paris");
    await user.click(screen.getByRole("button", { name: "Create our couple" }));

    expect(await screen.findByText("ABCD2345")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for your partner/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to the app" })).toBeInTheDocument();
    expect(screen.getByText(/Checking every 5 seconds/)).toBeInTheDocument();
    expect(body).toEqual({ timezone: "Europe/Paris" });
  });

  it("copies the code and lets a solo couple continue into the app", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    signedIn(coupledUser);
    coupleResponse(soloCouple);

    await openPair();
    await screen.findByText("ABCD2345");
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCD2345"));
    expect(await screen.findByText("Invite code copied.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Continue to the app" }));
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("polls while solo and moves to / when the partner joins", async () => {
    let calls = 0;
    signedIn(coupledUser);
    server.use(
      http.get("*/api/couple", () => {
        calls += 1;
        return HttpResponse.json({ couple: calls === 1 ? soloCouple : fullCouple });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/pair");
      expect(await screen.findByText("ABCD2345")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("joins with an uppercase code and lands on /", async () => {
    const user = userEvent.setup();
    let body: unknown;
    signedIn(defaultUser);
    server.use(
      http.post("*/api/couple/join", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ couple: fullCouple });
      }),
    );

    await openPair();
    const input = screen.getByLabelText("Invite code");
    await user.type(input, "abcd2345");
    expect(input).toHaveValue("ABCD2345");
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(body).toEqual({ invite_code: "ABCD2345" });
  });

  it("validates the code format before calling the join endpoint", async () => {
    const user = userEvent.setup();
    const joinRequest = vi.fn();
    signedIn(defaultUser);
    server.use(
      http.post("*/api/couple/join", () => {
        joinRequest();
        return HttpResponse.error();
      }),
    );

    await openPair();
    await user.type(screen.getByLabelText("Invite code"), "abc");
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByText("Enter a valid invite code.")).toBeInTheDocument();
    expect(joinRequest).not.toHaveBeenCalled();
  });

  it("shows invalid_code inline", async () => {
    const user = userEvent.setup();
    signedIn(defaultUser);
    server.use(
      http.post("*/api/couple/join", () =>
        apiError("invalid_code", "That invite code is not valid.", 404),
      ),
    );

    await openPair();
    await user.type(screen.getByLabelText("Invite code"), "ABCD2345");
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That invite code is not valid.");
    expect(screen.getByRole("heading", { name: "Join with a code" })).toBeInTheDocument();
  });

  it("shows couple_full inline", async () => {
    const user = userEvent.setup();
    signedIn(defaultUser);
    server.use(
      http.post("*/api/couple/join", () =>
        apiError("couple_full", "This couple already has two members.", 409),
      ),
    );

    await openPair();
    await user.type(screen.getByLabelText("Invite code"), "ABCD2345");
    await user.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This couple already has two members.",
    );
  });
});
