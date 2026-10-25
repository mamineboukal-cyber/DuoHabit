# Changelog

All notable changes to DuoHabits are recorded here, one entry per roadmap step.
Newest entries are appended at the bottom.

## Step 1 — Backend scaffold — 2026-10-24

### Added

- Flask application factory (`backend/app/__init__.py`) with environment-driven config
  (`development`, `testing`, `production`) and fail-fast production secret validation.
- `GET /api/health` returning `{"status":"ok"}`.
- Canonical JSON error envelope (`{"error": {"code", "message", "details?"}}`) with
  handlers for `ApiError`, HTTP errors (400/404/405/415) and unexpected exceptions.
- Extension instances for SQLAlchemy, Flask-Migrate, Flask-Login and Flask-Limiter
  (wired to app; features use them in later steps).
- `docker-compose.yml` with PostgreSQL 16 for local development.
- `.env.example`, `.gitignore`, README setup instructions.
- GitHub Actions CI running `ruff check` and `pytest` on Python 3.14 with a PostgreSQL 16
  service container.
- Tests: health endpoint, JSON 404 for unknown `/api` routes, JSON 405 for wrong method.

### Files touched

`backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pyproject.toml`,
`backend/wsgi.py`, `backend/app/{__init__,config,extensions,errors}.py`,
`backend/app/routes/{__init__,health}.py`, `backend/tests/conftest.py`,
`backend/tests/__init__.py`, `backend/tests/integration/{__init__,test_health}.py`,
`docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`, `CHANGELOG.md`,
`.github/workflows/ci.yml`.

### Approved deviations

- **Python 3.14 instead of 3.12** (owner-approved; 3.12 is not installed on the dev
  machine). Pins adjusted for 3.14-compatible releases: `SQLAlchemy~=2.0.55`,
  `argon2-cffi~=25.1`, `pytest-cov~=6.2`, `gunicorn~=26.2`; Docker/CI use Python 3.14.
- **`pywebpush` deferred to Step 21** (owner-approved; Phase 2 dependency).
- **`.env` is loaded explicitly from the repository root** with `python-dotenv`
  (owner-approved) because the API runs from `backend/`.
- **JSON 404/405 responses apply to all routes for now** (owner-approved); the SPA
  fallback for non-`/api` GETs replaces this in Step 15.

## Step 2 — Models and migrations (users, couples) — 2026-10-25

### Added

- `couples` table: identity `id`, `CHAR(8)` unique `invite_code`,
  `timezone` (default `Africa/Casablanca`), `created_at`.
- `users` table: identity `id`, unique `email`, `password_hash`,
  `display_name` (1–40), nullable `couple_id` FK `ON DELETE SET NULL` with index,
  `created_at`.
- `User.couple` / `Couple.members` relationships.
- Alembic migrations created with `flask db init` and `flask db migrate`; the generated
  revision `fb6b24206447` was reviewed and kept, then formatted with ruff.
- Database fixtures in `tests/conftest.py`: schema from model metadata plus a per-test
  outer transaction that is rolled back (Flask-SQLAlchemy binds are redirected to the
  test connection, and sessions use `create_savepoint`).
- Tests: duplicate email raises `IntegrityError`, user/couple round-trip, empty display
  name rejected, uppercase email rejected.
- CI now runs `flask --app wsgi db upgrade` against a clean PostgreSQL 16 service before
  running pytest, so the migration itself is exercised.
- README: `flask db upgrade` is now part of local setup.

### Files touched

`backend/app/models/{__init__,couple,user}.py`, `backend/app/__init__.py`,
`backend/migrations/` (generated: `alembic.ini`, `env.py`, `script.py.mako`, `README`,
`versions/fb6b24206447_create_users_and_couples.py`), `backend/tests/conftest.py`,
`backend/tests/integration/test_models.py`, `.github/workflows/ci.yml`, `README.md`,
`CHANGELOG.md`.

### Approved deviations / additions

- **`tests/integration/test_models.py` added** to the section 10 tree (owner-approved),
  because the step's "Done when" requires the unique-email test in this step.
- **`CHECK (email = lower(email))` added to `users`** (owner-approved addition); the
  unique index remains a plain, case-sensitive one. Email normalization still happens
  in the Step 3 auth service.
- **`from . import models` in `create_app`** (owner-approved) so Alembic autogenerate
  sees the metadata.
- **`db.create_all()` is used for pytest schema, while CI also runs `flask db upgrade`**
  on a clean database (owner-approved).

## Step 3 — Auth (F1) — 2026-10-25

### Added

- `POST /api/auth/register` (201, starts a session), `POST /api/auth/login` (200),
  `POST /api/auth/logout` (204), `GET /api/auth/me` (200), `PATCH /api/auth/me` (200),
  all returning the section-7 `user` object.
- argon2 password hashing, lowercased emails, case-insensitive duplicate detection
  (`409 email_taken`, including the unique-constraint race), and the `ALLOWED_EMAILS`
  allowlist (`403 registration_closed`).
- Uniform `401 invalid_credentials` for unknown email and wrong password.
- Flask-Login session handling with the 30-day permanent session, JSON 401
  (`unauthenticated`) instead of a redirect, and a user loader.
- `security.py`: Origin guard (`403 bad_origin`), Content-Type guard
  (`415 unsupported_media_type`), and CSP / nosniff / Referrer-Policy / X-Frame-Options
  headers (HSTS in production only).
- Rate limiting: shared 10/min per-IP bucket for register + login only; 120/min default
  for everything else, keyed by `user:<id>` when authenticated and `ip:<addr>` otherwise.
- `MAX_CONTENT_LENGTH = 64 KB`, with `413 request_too_large` in the standard error
  envelope (also added `429 rate_limited` and pydantic `422 validation_error` details).
- Pydantic request schemas with `extra="forbid"`, trimmed email/display name, password
  length 10–128, and email format validation without adding `email-validator`.

### Files touched

`backend/app/{__init__,config,errors,extensions,security}.py`,
`backend/app/models/user.py`, `backend/app/schemas/{__init__,auth}.py`,
`backend/app/services/{__init__,auth_service}.py`, `backend/app/routes/auth.py`,
`backend/tests/conftest.py`, `backend/tests/integration/{test_auth,test_security}.py`,
`CHANGELOG.md`.

### Tests added

- `test_auth.py`: register 201 + session cookie flags, email lowercasing, case-insensitive
  duplicate, allowlist, validation details (weak/too long password, blank name, extra
  field, bad email), login success and byte-identical failure bodies, logout invalidation,
  PATCH profile, 11th credentials request → 429, 15 consecutive `/me` calls → 200, and no
  response ever contains the password or hash.
- `test_security.py`: bad/allowed Origin, non-JSON body → 415, malformed JSON → 400,
  oversized body → 413, headers present (and no HSTS in testing), headers on error
  responses.

### Approved deviations / decisions

- **`services/auth_service.py` added** (owner-approved) because rule 7 forbids business
  logic in routes; Step 3's file list omitted a service.
- **`UserMixin` added to the `User` model** (owner-approved; no schema change).
- **`errors.py` extended** with the 429 → `rate_limited` mapping and the pydantic
  `validation_error` builder (owner-approved).
- **Rate limiting enabled in `TestingConfig`** and reset by an autouse fixture
  (owner-approved) so the 429 criterion is testable.
- **Email validation uses a regex**, not `EmailStr`/`email-validator` (owner-approved;
  keeps section 5's dependency list).
- **Passwords are not whitespace-stripped** and have a 128-character maximum; request
  bodies are capped at 64 KB (owner-approved).
- **The 10/min per-IP bucket is shared only by register and login** (owner's change);
  `/me`, `PATCH /me` and `/logout` use the 120/min default.
- **120/min is keyed by user id when authenticated, IP otherwise**, and register/login set
  `session.permanent = True` (owner-approved).
- **Health is included in the 120/min default** (owner-approved).
- **Development/testing `SECRET_KEY` fallbacks** were added so the app and tests run
  without a local `.env`; production still refuses keys shorter than 32 characters.
- **Test harness change:** the app context is now per-test (not session-wide) because
  Flask-Login caches the user on `g`; without it, auth state leaked between tests.

### Follow-up for Step 15

- Configure `werkzeug.middleware.proxy_fix.ProxyFix` so rate limiting sees the real client
  IP behind the Render proxy.

## Step 4 — Couple pairing (F2) — 2026-10-25

### Added

- `POST /api/couple` (201), `POST /api/couple/join` (200), `GET /api/couple` (200) and
  `PATCH /api/couple` (200), returning the section-7 `couple` object.
- 8-character invite codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` via `secrets.choice`;
  the code is returned only while the couple has one member and becomes `null` at two.
- Join flow: `409 already_in_couple` first, then `SELECT ... FOR UPDATE` on the couple
  row, a fresh member count, `404 invalid_code` for unknown codes and `409 couple_full`
  at two members. The row lock makes the two-seat rule safe under concurrent joins.
- Timezone support: `services/timeutil.py` validates IANA names with stdlib
  `zoneinfo`; create defaults to `DEFAULT_TIMEZONE`, either member can PATCH, and invalid
  names return `422 validation_error` with `details.timezone`.
- `409 no_couple` for `GET`/`PATCH` when the caller has no couple; every read derives the
  couple from `current_user.couple_id`, so there is no cross-couple lookup path.
- `POST /api/couple/join` has its own 10/min per-IP bucket (section 9), applied above
  `@login_required` so unauthenticated guessing is counted too.

### Files touched

`backend/app/services/{timeutil,couple_service}.py`,
`backend/app/schemas/{__init__,couple}.py`, `backend/app/routes/couple.py`,
`backend/app/__init__.py`, `backend/tests/conftest.py`,
`backend/tests/integration/test_couple.py`, `backend/tests/unit/{__init__,test_timeutil}.py`,
`CHANGELOG.md`.

### Tests added

- `test_couple.py`: create 201 (code shape/alphabet, default and explicit timezone,
  absent body), duplicate create 409, invalid timezone 422, malformed JSON 400, join 200
  with lowercase/whitespace code, hidden code at two members, unknown code 404, malformed
  code 422, full couple 409, already-paired precedence 409, `no_couple` 409 on
  GET/PATCH, timezone change by either member, extra-field rejection, two-couple
  isolation, 11th join in a minute 429, and the two-thread concurrent join with exactly
  one success and two final members.
- `test_timeutil.py`: valid IANA names accepted; empty, unknown, traversal-style and
  over-64-character names rejected.

### Approved deviations / decisions

- **`tests/unit/test_timeutil.py` (+ `tests/unit/__init__.py`) added** (owner-approved);
  Step 4's list omitted test files.
- **The concurrency test commits real rows** (owner-approved): it skips the rollback
  fixture, seeds users with unique emails, uses two app contexts/connections and a
  barrier, and removes its users and couple in `finally` so a failure cannot leave rows
  behind.
- **Join is rate limited to 10/min per IP** and tested (owner-approved; section 9
  requires it even though Step 4's bullet did not repeat it).
- **Invite codes are stripped and uppercased before validation** (owner-approved);
  malformed shapes return 422, well-formed unknown codes 404 `invalid_code`.
- **Invite-code collisions are retried** up to 5 generations on the unique constraint
  (owner-approved) instead of surfacing a 500.
- **An absent body on `POST /api/couple` is treated as `{}`** (owner's change); malformed
  JSON still returns 400 `bad_json` and a non-JSON body 415.
- **`already_in_couple` is checked before the invite code** (owner-approved), so a paired
  user never learns whether a code exists.

### Implementation notes

- **Test harness:** multiple test clients in one test share the per-test app context, so
  Flask-Login's `g._login_user` cache leaked the previous client's user. The test client
  now clears that cache before each request; production already gets a fresh app context
  per request.
- No model or migration changes (`flask db check` reports no drift); no new dependencies.
- `created_at` is serialized as ISO 8601 UTC; members are ordered by id.



