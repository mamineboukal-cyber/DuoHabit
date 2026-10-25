import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { errorMessage, fieldErrors } from "../api/client";
import { useLogin } from "../api/hooks";
import { loginSchema, zodFieldErrors } from "../lib/validation";

const LOGIN_MESSAGES: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  rate_limited: "Too many attempts, wait a minute.",
};

function inputClass(hasError: boolean): string {
  return [
    "min-h-11 w-full rounded-control border bg-canvas/60 px-3 py-2 text-base text-content",
    "placeholder:text-content-subtle focus:outline-none",
    hasError ? "border-danger" : "border-line focus:border-accent",
  ].join(" ");
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const state = location.state as { from?: string } | null;
  const redirectTo = state?.from?.startsWith("/") ? state.from : "/";

  function update(field: "email" | "password", value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = loginSchema.safeParse(values);
    if (!result.success) {
      setErrors(zodFieldErrors(result.error));
      return;
    }

    setErrors({});
    login.mutate(result.data, {
      onSuccess: () => navigate(redirectTo, { replace: true }),
      onError: (error) => {
        const fields = fieldErrors(error);
        if (Object.keys(fields).length > 0) {
          setErrors(fields);
          return;
        }
        setFormError(errorMessage(error, LOGIN_MESSAGES));
      },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">DuoHabits</p>
          <h1 className="mt-2 text-3xl font-bold">Log in</h1>
          <p className="mt-2 text-sm text-content-muted">Small habits, shared streak.</p>
        </header>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-xl"
        >
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-sm font-medium text-content-muted"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              className={inputClass(Boolean(errors.email))}
            />
            {errors.email && (
              <p id="login-email-error" className="mt-1 text-sm text-danger-foreground">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-content-muted"
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => update("password", event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              className={inputClass(Boolean(errors.password))}
            />
            {errors.password && (
              <p id="login-password-error" className="mt-1 text-sm text-danger-foreground">
                {errors.password}
              </p>
            )}
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="min-h-11 w-full rounded-control bg-accent px-4 py-2.5 text-base font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {login.isPending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-content-muted">
          New here?{" "}
          <Link to="/register" className="font-semibold text-accent hover:text-accent-hover">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
