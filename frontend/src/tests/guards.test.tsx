import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "./helpers";
import { coupledUser, defaultUser, server } from "./server";

describe("route guards", () => {
  it("redirects an unauthenticated user from / to /login", async () => {
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("redirects an unauthenticated user from /pair to /login", async () => {
    renderApp("/pair");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("sends a user without a couple from / to /pair", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: defaultUser })));

    renderApp("/");

    expect(
      await screen.findByRole("heading", { name: "Pair with your partner" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create our couple" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Join with a code" })).toBeInTheDocument();
  });

  it("redirects an authenticated user away from /login to /pair when unpaired", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: defaultUser })));

    renderApp("/login");

    expect(
      await screen.findByRole("heading", { name: "Pair with your partner" }),
    ).toBeInTheDocument();
  });

  it("renders the app shell for a user with a couple", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: coupledUser })));

    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Today" }).length).toBeGreaterThan(0);
  });

  it("shows an error with retry when the session check fails", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get("*/api/auth/me", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { error: { code: "internal_error", message: "Unexpected error." } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ user: coupledUser });
      }),
    );

    renderApp("/");
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });
});
