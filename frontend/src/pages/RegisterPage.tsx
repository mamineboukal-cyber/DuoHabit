import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { errorMessage, fieldErrors, isApiError } from "../api/client";
import { useRegister } from "../api/hooks";
import { registerSchema, zodFieldErrors } from "../lib/validation";

const REGISTER_MESSAGES: Record<string, string> = {
  email_taken: "That email is already registered.",
  registration_closed: "Registration is closed for this email.",
  rate_limited: "Too many attempts, wait a minute.",
};

function inputClass(hasError: boolean): string {
  return [
    "min-h-11 w-full rounded-control border bg-canvas/60 px-3 py-2 text-base text-content",
    "placeholder:text-content-subtle focus:outline-none",
    hasError ? "border-danger" : "border-line focus:border-accent",
  ].join(" ");
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();

  const [values, setValues] = useState({ email: "", display_name: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function update(field: "email" | "display_name" | "password", value: string) {
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

    const result = registerSchema.safeParse(values);
    if (!result.success) {
      setErrors(zodFieldErrors(result.error));
      return;
    }

    setErrors({});
    register.mutate(result.data, {
      onSuccess: () => navigate("/", { replace: true }),
      onError: (error) => {
        if (isApiError(error) && error.code === "email_taken") {
          setErrors({ email: REGISTER_MESSAGES.email_taken });
          return;
        }
        const fields = fieldErrors(error);
        if (Object.keys(fields).length > 0) {
          setErrors(fields);
          return;
        }
        setFormError(errorMessage(error, REGISTER_MESSAGES));
      },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">DuoHabits</p>
          <h1 className="mt-2 text-3xl font-bold">Create account</h1>
          <p className="mt-2 text-sm text-content-muted">Start a streak with your person.</p>
        </header>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-xl"
        >
          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-sm font-medium text-content-muted"
            >
              Email
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "register-email-error" : undefined}
              className={inputClass(Boolean(errors.email))}
            />
            {errors.email && (
              <p id="register-email-error" className="mt-1 text-sm text-danger-foreground">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-display-name"
              className="mb-1.5 block text-sm font-medium text-content-muted"
            >
              Display name
            </label>
            <input
              id="register-display-name"
              name="display_name"
              type="text"
              autoComplete="nickname"
              value={values.display_name}
              onChange={(event) => update("display_name", event.target.value)}
              aria-invalid={Boolean(errors.display_name)}
              aria-describedby={errors.display_name ? "register-display-name-error" : undefined}
              className={inputClass(Boolean(errors.display_name))}
            />
            {errors.display_name && (
              <p id="register-display-name-error" className="mt-1 text-sm text-danger-foreground">
                {errors.display_name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-sm font-medium text-content-muted"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => update("password", event.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "register-password-error" : "register-password-hint"
                }
                className={`${inputClass(Boolean(errors.password))} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-sm font-medium text-content-muted"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password ? (
              <p id="register-password-error" className="mt-1 text-sm text-danger-foreground">
                {errors.password}
              </p>
            ) : (
              <p id="register-password-hint" className="mt-1 text-xs text-content-subtle">
                At least 10 characters.
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
            disabled={register.isPending}
            className="min-h-11 w-full rounded-control bg-accent px-4 py-2.5 text-base font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {register.isPending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-content-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-accent hover:text-accent-hover">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
