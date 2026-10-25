import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderApp } from "./helpers";
import { coupledUser, fullCouple, server } from "./server";

function signedIn() {
  server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: coupledUser })));
}

async function mobileNav() {
  return screen.findByRole("navigation", { name: "Mobile primary" });
}

describe("AppShell", () => {
  it("lets a solo couple use the shell at / without waiting on /pair", async () => {
    signedIn();

    renderApp("/");

    expect(await screen.findByText(/You're signed in, Owner/)).toBeInTheDocument();
    const nav = await mobileNav();
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const label of ["Today", "Habits", "Duel", "Settings"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("navigates between the tab destinations and marks the active tab", async () => {
    const user = userEvent.setup();
    signedIn();

    renderApp("/");
    const nav = await mobileNav();
    await user.click(within(nav).getByRole("link", { name: "Habits" }));

    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Habits" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(nav).getByRole("link", { name: "Duel" }));
    expect(await screen.findByRole("heading", { name: "Duel" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("link", { name: "Today" }));
    expect(await screen.findByText(/You're signed in, Owner/)).toBeInTheDocument();
  });

  it("redirects a full couple from /pair to /", async () => {
    signedIn();
    server.use(http.get("*/api/couple", () => HttpResponse.json({ couple: fullCouple })));

    renderApp("/pair");

    expect(await screen.findByText(/You're signed in, Owner/)).toBeInTheDocument();
  });
});
