import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "./helpers";
import { defaultUser, server } from "./server";

const user: typeof defaultUser = {
  ...defaultUser,
  id: 2,
  email: "new@example.com",
  display_name: "New",
};

function authError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

async function openRegister() {
  renderApp("/register");
  await screen.findByRole("heading", { name: "Create account" });
}

async function fillRegistration(actor: ReturnType<typeof userEvent.setup>) {
  await actor.type(screen.getByLabelText("Email"), "new@example.com");
  await actor.type(screen.getByLabelText("Display name"), "New");
  await actor.type(screen.getByLabelText("Password"), "correct-horse-battery");
}

describe("RegisterPage", () => {
  it("validates the fields before calling the API", async () => {
    const actor = userEvent.setup();
    const registerRequest = vi.fn();
    server.use(
      http.post("*/api/auth/register", () => {
        registerRequest();
        return authError("email_taken", "That email is already registered.", 409);
      }),
    );

    await openRegister();
    await actor.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Display name is required.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 10 characters.")).toBeInTheDocument();
    expect(registerRequest).not.toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    const actor = userEvent.setup();
    await openRegister();

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await actor.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    await actor.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("shows email_taken under the email field", async () => {
    const actor = userEvent.setup();
    server.use(
      http.post("*/api/auth/register", () =>
        authError("email_taken", "That email is already registered.", 409),
      ),
    );

    await openRegister();
    await fillRegistration(actor);
    await actor.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("That email is already registered.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows registration_closed as a form error", async () => {
    const actor = userEvent.setup();
    server.use(
      http.post("*/api/auth/register", () =>
        authError("registration_closed", "Registration is closed.", 403),
      ),
    );

    await openRegister();
    await fillRegistration(actor);
    await actor.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Registration is closed for this email.",
    );
  });

  it("disables the button while creating the account and navigates on success", async () => {
    const actor = userEvent.setup();
    server.use(
      http.post("*/api/auth/register", async () => {
        await delay(100);
        return HttpResponse.json({ user }, { status: 201 });
      }),
    );

    await openRegister();
    await fillRegistration(actor);
    await actor.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("button", { name: "Creating account…" })).toBeDisabled();
    expect(
      await screen.findByRole("heading", { name: "Pair with your partner" }),
    ).toBeInTheDocument();
  });
});
