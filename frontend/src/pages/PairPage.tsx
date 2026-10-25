import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { errorMessage, fieldErrors, isApiError } from "../api/client";
import { useCouple, useCreateCouple, useJoinCouple, useLogout } from "../api/hooks";
import { useToast } from "../components/Toast";
import { joinCoupleSchema, zodFieldErrors } from "../lib/validation";

const DEFAULT_TIMEZONE = "Africa/Casablanca";

const FALLBACK_TIMEZONES = [
  "Africa/Casablanca",
  "Africa/Accra",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "UTC",
];

/** All IANA zones when the runtime exposes them, with a small fallback list. */
function timezoneOptions(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  if (typeof intl.supportedValuesOf === "function") {
    try {
      const zones = intl.supportedValuesOf("timeZone");
      if (zones.length > 0) {
        return Array.from(new Set([DEFAULT_TIMEZONE, ...zones]));
      }
    } catch {
      // Older engines fall through to the curated list.
    }
  }

  return FALLBACK_TIMEZONES;
}

const TIMEZONES = timezoneOptions();

const CREATE_MESSAGES: Record<string, string> = {
  already_in_couple: "You're already in a couple.",
  rate_limited: "Too many attempts, wait a minute.",
};

const JOIN_MESSAGES: Record<string, string> = {
  invalid_code: "That invite code is not valid.",
  couple_full: "This couple already has two members.",
  already_in_couple: "You're already in a couple. Continue to the app to see your pair.",
  rate_limited: "Too many attempts, wait a minute.",
};

const INPUT_CLASS =
  "min-h-11 w-full rounded-control border bg-canvas px-3 py-2 text-base text-content placeholder:text-content-subtle focus:border-accent focus:outline-none";

const PRIMARY_BUTTON_CLASS =
  "min-h-11 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-content-muted transition hover:border-line-strong hover:text-content disabled:cursor-not-allowed disabled:opacity-60";

function PairLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <p role="status" className="animate-pulse text-sm text-content-muted">
        Loading your pairing…
      </p>
    </main>
  );
}

export default function PairPage() {
  const coupleQuery = useCouple();
  const createCouple = useCreateCouple();
  const joinCouple = useJoinCouple();
  const logout = useLogout();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [code, setCode] = useState("");
  const [joinFieldErrors, setJoinFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (coupleQuery.isPending) {
    return <PairLoading />;
  }

  if (coupleQuery.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t load your pairing</h1>
        <p className="max-w-sm text-sm text-content-muted">{errorMessage(coupleQuery.error)}</p>
        <button
          type="button"
          onClick={() => {
            void coupleQuery.refetch();
          }}
          className={PRIMARY_BUTTON_CLASS}
        >
          Retry
        </button>
      </main>
    );
  }

  const couple = coupleQuery.data;

  // A full couple has no pairing work left; solo couples may stay here to share
  // the code or head straight into the app.
  if (couple && couple.members.length >= 2) {
    return <Navigate to="/" replace />;
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    createCouple.mutate(
      { timezone },
      {
        onError: (error) => {
          const details = fieldErrors(error);
          if (details.timezone) {
            setCreateError(details.timezone);
          } else {
            setCreateError(errorMessage(error, CREATE_MESSAGES));
          }
          if (isApiError(error) && error.code === "already_in_couple") {
            void coupleQuery.refetch();
          }
        },
      },
    );
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);

    const result = joinCoupleSchema.safeParse({ invite_code: code });
    if (!result.success) {
      setJoinFieldErrors(zodFieldErrors(result.error));
      return;
    }

    setJoinFieldErrors({});
    joinCouple.mutate(
      { invite_code: result.data.invite_code },
      {
        onSuccess: () => navigate("/", { replace: true }),
        onError: (error) => {
          const details = fieldErrors(error);
          if (details.invite_code) {
            setJoinFieldErrors({ invite_code: details.invite_code });
            return;
          }
          setJoinError(errorMessage(error, JOIN_MESSAGES));
          if (isApiError(error) && error.code === "already_in_couple") {
            void coupleQuery.refetch();
          }
        },
      },
    );
  }

  async function handleCopy() {
    if (!couple?.invite_code) {
      return;
    }

    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(couple.invite_code);
      setCopied(true);
      showToast("Invite code copied.", "success");
    } catch {
      showToast("Couldn't copy the code. Select it and copy it manually.");
    }
  }

  function handleLogout() {
    logout.mutate(undefined, {
      onError: (error) => showToast(errorMessage(error)),
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">DuoHabits</p>
        <h1 className="mt-2 text-3xl font-bold">Pair with your partner</h1>
        <p className="mt-2 text-sm text-content-muted">
          {couple
            ? "Share your invite code. Your partner can join from their own account."
            : "Create a couple and share the code, or join with a code you were given."}
        </p>
      </header>

      {couple ? (
        <section className="mx-auto mt-8 w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Invite code
          </p>
          <h2 className="mt-2 text-lg font-semibold">Share this with your partner</h2>

          {couple.invite_code ? (
            <>
              <p
                aria-label={`Invite code ${couple.invite_code}`}
                className="mt-5 break-all text-4xl font-bold tracking-[0.25em] text-content"
              >
                {couple.invite_code}
              </p>
              <p className="mt-3 text-sm text-content-muted">
                {couple.members[0]?.display_name} is waiting for the second member.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy();
                  }}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <Link to="/" className={PRIMARY_BUTTON_CLASS}>
                  Continue to the app
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-content-muted">
              The invite code is no longer available because your couple is complete.
            </p>
          )}

          <p
            role="status"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-content-muted"
          >
            <span className="h-2 w-2 animate-pulse rounded-pill bg-accent" aria-hidden="true" />
            Waiting for your partner…
          </p>
          <p className="mt-1 text-xs text-content-subtle">
            Checking every 5 seconds. You can keep using the app while you wait.
          </p>
        </section>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="rounded-card border border-line bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Create our couple</h2>
            <p className="mt-1 text-sm text-content-muted">
              Pick the timezone your days follow, then share the invite code.
            </p>

            <form noValidate onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="pair-timezone"
                  className="mb-1.5 block text-sm font-medium text-content-muted"
                >
                  Couple timezone
                </label>
                <select
                  id="pair-timezone"
                  name="timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className={INPUT_CLASS}
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-content-subtle">
                  Daily dates and the weekly duel use this timezone.
                </p>
              </div>

              {createError && (
                <p
                  role="alert"
                  className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground"
                >
                  {createError}
                </p>
              )}

              <button
                type="submit"
                disabled={createCouple.isPending}
                className={`${PRIMARY_BUTTON_CLASS} w-full`}
              >
                {createCouple.isPending ? "Creating…" : "Create our couple"}
              </button>
            </form>
          </section>

          <section className="rounded-card border border-line bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Join with a code</h2>
            <p className="mt-1 text-sm text-content-muted">
              Enter the 8-character code from your partner.
            </p>

            <form noValidate onSubmit={handleJoin} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="pair-invite-code"
                  className="mb-1.5 block text-sm font-medium text-content-muted"
                >
                  Invite code
                </label>
                <input
                  id="pair-invite-code"
                  name="invite_code"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="ABCD2345"
                  aria-invalid={Boolean(joinFieldErrors.invite_code)}
                  aria-describedby={
                    joinFieldErrors.invite_code ? "pair-invite-code-error" : "pair-invite-code-hint"
                  }
                  className={`${INPUT_CLASS} text-lg tracking-[0.25em] ${
                    joinFieldErrors.invite_code ? "border-danger" : "border-line"
                  }`}
                />
                {joinFieldErrors.invite_code ? (
                  <p id="pair-invite-code-error" className="mt-1 text-sm text-danger-foreground">
                    {joinFieldErrors.invite_code}
                  </p>
                ) : (
                  <p id="pair-invite-code-hint" className="mt-1 text-xs text-content-subtle">
                    Letters and numbers, 8 characters.
                  </p>
                )}
              </div>

              {joinError && (
                <p
                  role="alert"
                  className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground"
                >
                  {joinError}
                </p>
              )}

              <button
                type="submit"
                disabled={joinCouple.isPending}
                className={`${PRIMARY_BUTTON_CLASS} w-full`}
              >
                {joinCouple.isPending ? "Joining…" : "Join"}
              </button>
            </form>
          </section>
        </div>
      )}

      <footer className="mt-8 text-center">
        <button
          type="button"
          onClick={handleLogout}
          disabled={logout.isPending}
          className={SECONDARY_BUTTON_CLASS}
        >
          {logout.isPending ? "Logging out…" : "Log out"}
        </button>
      </footer>
    </main>
  );
}
