import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "./helpers";
import { defaultUser, server } from "./server";

function authError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

async function openLogin() {
  renderApp("/login");
  await screen.findByRole("heading", { name: "Log in" });
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
}

describe("LoginPage", () => {
  it("validates the fields before calling the API", async () => {
    const user = userEvent.setup();
    const loginRequest = vi.fn();
    server.use(
      http.post("*/api/auth/login", () => {
        loginRequest();
        return authError("invalid_credentials", "Wrong email or password.", 401);
      }),
    );

    await openLogin();
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();
  });

  it("disables the button while logging in and navigates on success", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", async () => {
        await delay(100);
        return HttpResponse.json({ user: defaultUser });
      }),
    );

    await openLogin();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("button", { name: "Logging in…" })).toBeDisabled();
    expect(await screen.findByText(/You're signed in/)).toBeInTheDocument();
  });

  it("shows the invalid-credentials error inline", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", () =>
        authError("invalid_credentials", "Wrong email or password.", 401),
      ),
    );

    await openLogin();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("maps 429 to the rate-limit copy", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", () =>
        authError("rate_limited", "Too many requests. Try again later.", 429),
      ),
    );

    await openLogin();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts, wait a minute.");
  });
});
