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

## Step 5 — Habits (F3) — 2026-10-25

### Added

- `GET /api/habits` (200, `owner=me|partner`, `include_archived=false`),
  `POST /api/habits` (201), `PATCH /api/habits/{id}` (200) and
  `DELETE /api/habits/{id}` (204), returning the section-7 `habit` object.
- Create defaults: `emoji=null`, `difficulty=1`, `schedule_days=[0..6]`; validation for
  name length, emoji length, difficulty range, non-empty/in-range/duplicate-free schedule
  days, and extra fields, all with per-field `422 validation_error` details.
- Per-owner active-name uniqueness, case-insensitive, enforced by a partial unique index
  and a service pre-check; the constraint race is mapped to `409 habit_name_taken`.
  Archived names can be reused, and partners may use the same name as each other.
- Authorization: list is filtered by the caller's `couple_id`; PATCH/DELETE return 404
  for missing or other-couple habits and 403 for a same-couple non-owner.
- Archive sets `archived_at` and never deletes the row, so future check-ins and points
  remain. Archived habits are hidden by default, visible with `include_archived=true`,
  and cannot be edited, re-archived or unarchived (404).
- `GET`/`POST` require a couple (`409 no_couple`); `owner=partner` on a solo couple
  returns an empty list.
- `parse_query` helper added for validated query parameters.

### Migration

- Revision `68fbea57c59f` creates `habits` with identity PK, cascading FKs to `users` and
  `couples`, `varchar(60)` name, `varchar(8)` emoji, `smallint` difficulty, `smallint[]`
  schedule, streak counters, `archived_at`, `created_at`, `updated_at`.
- Checks: name length, difficulty 1–3, non-empty schedule, schedule subset of 0–6,
  non-negative streaks. Indexes: `(owner_id, archived_at)`, `(couple_id)`, and
  `UNIQUE (owner_id, lower(name)) WHERE archived_at IS NULL`.
- Verified from a clean database: dropped/recreated `duohabits_migration_check`, ran
  `flask db upgrade` from zero, `flask db check` reported no drift, and `\d habits`
  confirmed the partial index, `schedule_days` default `'{0,1,2,3,4,5,6}'::smallint[]`
  and every CHECK. Postgres displays the index as `lower(name::text)`, which is the same
  expression. Then dropped/recreated `duohabits_test` and ran the full suite.
- Dev database upgraded to head (`68fbea57c59f`).

### Files touched

`backend/app/models/{habit,__init__}.py`,
`backend/app/schemas/{__init__,habit}.py`,
`backend/app/services/habit_service.py`, `backend/app/routes/habits.py`,
`backend/app/__init__.py`,
`backend/migrations/versions/68fbea57c59f_create_habits.py`,
`backend/tests/integration/test_habits.py`, `CHANGELOG.md`.

### Tests added

- 34 integration tests, including: create defaults/custom/trimming; ten validation cases;
  case-insensitive duplicate 409; partner name reuse and post-archive name reuse; partner
  read-only (403 on PATCH/DELETE); other-couple 404; list defaults, `owner=partner`,
  `include_archived`, solo-partner empty, no-couple 409 and query validation; explicit
  creation-order assertions; PATCH subset, name conflict, explicit nulls and empty body;
  archive hides the habit while keeping the row, re-archive and archived PATCH 404.
- **DB-level uniqueness test:** two raw inserts of `"Run"` and `"run"` for the same owner
  raise `IntegrityError` with `constraint_name == "uq_habits_owner_name_active"`, proving
  the index independently of the service pre-check.

### Approved deviations / decisions

- **`tests/integration/test_habits.py` added** (owner-approved); Step 5's list omitted
  test files.
- **`parse_query` added to `schemas/__init__.py`** (owner-approved) so query parameters
  use the same 422 envelope as bodies.
- **Archived habits return 404 for PATCH/DELETE**, including a second DELETE, and cannot
  be unarchived in the MVP (owner-approved).
- **Emoji is trimmed**, blank becomes `null`, max 8 characters, and `PATCH {"emoji": null}`
  clears it (owner-approved).
- **`schedule_days` is sorted**, duplicates are rejected with 422, values must be 0–6 and
  non-empty (owner-approved).
- **PATCH semantics:** `{}` returns 200 unchanged; explicit `null` for `name`,
  `difficulty` or `schedule_days` is a per-field 422; only `emoji` is nullable
  (owner-approved).
- **List order is `created_at ASC, id ASC`** (owner-approved) and asserted explicitly.
- **`updated_at` uses SQLAlchemy `onupdate=func.now()`**, not a DB trigger
  (owner-approved).
- **`owner=partner` on a solo couple returns `200 {habits: []}`**; `include_archived`
  applies to the selected owner (owner-approved).
- **Difficulty affecting only future check-ins** is deferred to Step 6, because check-ins
  do not exist yet; Step 5 verifies edits persist (owner-approved).
- **DB-level partial-index test and clean-database migration verification added** at the
  owner's request.

### Implementation notes

- Alembic autogenerated the expression index with `sa.literal_column("lower(name)")`;
  the file was hand-reviewed and `ruff format` applied. `flask db check` reports no drift.
- No new dependencies. `updated_at` is stored but not part of the section-7 API object.

## Step 6 — Scoring, streaks and check-ins (F4, F5, F6) — 2026-10-25

### Added

- `services/scoring.py`: pure `multiplier`, `points` and `level_for_xp` functions.
  The multiplier is capped at 1.5; points use `int(base * multiplier + 0.5)`;
  levels use the exact integer equivalent of `floor(sqrt(xp / 100)) + 1`.
- `services/streaks.py`: pure `streak_at_checkin`, `current_streak`, `longest_streak`
  and `best_streak` functions. Unscheduled days are skipped, today is pending until it
  is checked in, and the best streak never drops below the stored value.
- `services/timeutil.py` now exposes `today_in_tz(timezone)` for couple-local dates.
- `checkins` model and migration `f6af8e34ebbd`: identity PK, cascading FKs to habits
  and users, date/points/streak columns, `created_at`, unique
  `(habit_id, checkin_date)`, index `(user_id, checkin_date)`, and the two CHECKs.
- `POST /api/habits/{id}/checkins` (201) returning
  `{checkin, habit, total_xp, level}`. The owner only; the date must be today or
  yesterday in the couple timezone and must be scheduled; points are fixed at creation.
- `DELETE /api/habits/{id}/checkins/{date}` (200) returning `{habit, total_xp, level}`;
  it removes the row, recomputes both streak caches, and lowers XP by exactly the
  removed check-in's points.
- `total_xp = SUM(checkins.points)` for the caller and `level` is derived; no user
  columns were added.
- Duplicate check-ins are rejected by a service pre-check and by the database unique
  constraint; the race path maps `IntegrityError` to `409 already_checked_in`.
- `checkin` object: `{id, habit_id, checkin_date, points, streak_at_checkin}`.
- Malformed check-in path dates return `422 validation_error` with `details.date`;
  malformed body dates use the same envelope through pydantic.
- Check-in creation error precedence: 404 (missing/other couple), 403 (partner),
  409 `habit_archived`, 422 `date_out_of_range`, 422 `not_scheduled`,
  409 `already_checked_in`.

### Migration

- Revision `f6af8e34ebbd` creates `checkins` with the constraints and indexes above.
- Verified from a clean `duohabits_migration_check` database: `flask db upgrade` ran
  all three revisions from zero, `flask db check` reported no drift, and `\d checkins`
  confirmed the unique constraint, index, CHECKs and both cascading FKs. The temporary
  database was dropped afterwards; `duohabits_test` was recreated before the final
  suite, and the development database is at `f6af8e34ebbd`.

### Files touched

`backend/app/models/{checkin,__init__}.py`, `backend/app/schemas/checkin.py`,
`backend/app/services/{scoring,streaks,timeutil,checkin_service}.py`,
`backend/app/routes/habits.py`,
`backend/migrations/versions/f6af8e34ebbd_create_checkins.py`,
`backend/tests/unit/{test_scoring,test_streaks,test_timeutil}.py`,
`backend/tests/integration/test_checkins.py`, `CHANGELOG.md`.

### Tests added

- 52 new tests (141 total): 17 scoring, 11 streak, one `today_in_tz`, and 23 check-in
  integration tests.
- Scoring: the complete points ladder for difficulty 1–3 and streaks 1–8, multiplier
  1.0–1.5 including the cap, and levels 0/99/100/399/400/900.
- Streaks: daily 3-day run, gap reset, pending today, run since a miss, Mon/Wed/Fri
  with off days, missed scheduled day to zero, no check-ins, unscheduled dates, and
  best-streak preservation.
- F4 integration: today and yesterday accepted; older/future 422; unscheduled 422;
  duplicate 409; partner 403; other couple 404; archived 409; malformed body/path
  dates 422; missing habit/check-in 404; undo recomputes streaks and XP; level 2 at
  120 XP and back to level 1 after undo; archived-habit XP still counts.
- **Order-trap test (owner request):** with `freezegun`, check in today first and then
  yesterday. Yesterday's `streak_at_checkin` is 1 and its points are 10, proving it
  counts only days up to yesterday; the habit's current streak becomes 2.
- **Freezegun timezone test (owner request):** at 23:30 UTC the UTC date is
  2026-10-25 while `Asia/Tokyo` is 2026-10-26; check-ins for 26 and 25 succeed and
  24/27 return 422, proving the window follows the couple timezone.
- **DB-level test:** two raw inserts for the same `(habit_id, checkin_date)` raise
  `IntegrityError` with `constraint_name == "uq_checkins_habit_id_checkin_date"`.

### Approved deviations / decisions

- **`today_in_tz` added to `services/timeutil.py`** (owner-approved; not in Step 6's
  create list) because the date window and current streak need the couple-local date;
  `week_start`/`week_end` remain for Step 8.
- **Unit and integration test files added** (owner-approved; Step 6's list omitted
  them), plus a deterministic `today_in_tz` unit test.
- **No user XP/level columns** (owner-approved): `total_xp` is the SUM of the user's
  check-ins and `level` is derived.
- **Undo on an archived habit is allowed** for its owner within the today/yesterday
  window (owner-approved); the undo error list has no `habit_archived`. A test covers
  it. Check-in creation on an archived habit is still `409 habit_archived`.
- **Undo is limited to today/yesterday** (owner-approved); older dates return 422 even
  if a row exists.
- **Archived habits' check-ins still count toward `total_xp`** (owner-approved).
- **`best_streak` is `max(stored, longest_remaining_run)`** and never decreases, so
  undo preserves records (owner-approved).
- **Error precedence** is the order listed above (owner-approved).
- **Plain string path dates instead of Flask's `<date:>` converter** (owner's change):
  the route parses `YYYY-MM-DD`, returns 422 `validation_error` with `details.date`
  for malformed values, and still returns 404 for a missing habit with a valid date.
- **DB-level unique test and clean-database migration verification** (owner-approved).
- **Points and levels use exact arithmetic** (owner-approved): the specified
  `int(base * multiplier + 0.5)` formula and `math.isqrt` for levels.
- **`freezegun` was already in `requirements-dev.txt`**, so no dependency change.

### Implementation notes

- The check-in service derives the couple timezone from the habit's `couple_id` after
  the 404/403 checks, so it never falls back to server time.
- `streak_at_checkin` is computed from existing dates plus the new date before insert;
  `points` and `streak_at_checkin` are then immutable (A15).
- `total_xp` and `level` are recomputed after each commit; deleting a check-in lowers
  them immediately.
- `checkin_date` is serialized as `YYYY-MM-DD`; the habit payload remains the Step 5
  object and now shows the freshly recomputed streaks.
- Manual smoke test against a running development server confirmed 201 with 30 points
  for a hard habit, duplicate 409, yesterday 201, older 422, undo 200 with XP/streak
  recomputation, missing undo 404, malformed path 422, archive 204 and archived
  check-in 409. The manual user/couple rows were removed afterwards.

## Step 7 — Today endpoint (F8, F6 display) — 2026-10-25

### Added

- `GET /api/today` (session + couple; `401 unauthenticated`, `409 no_couple`) returning
  `date`, `timezone`, `me` and `partner` (`null` for a one-member couple).
- Per-user blocks: `user.id` / `user.display_name`, `level`, `total_xp`, `xp_into_level`,
  `xp_for_next_level`, `today_points`, and `habits` restricted to active habits scheduled
  for today's couple-local weekday, ordered `created_at ASC, id ASC`.
- Habit rows embed the Step 5 `habit` object plus `done`, `points_if_done` and
  `checkin_points` (`null` until done). `points_if_done` reuses the Step 6 pure functions
  with a hypothetical today check-in, so an undone row previews exactly what
  `POST /api/habits/{id}/checkins` will award; once done it equals the stored
  `checkin_points`.
- `today_points` sums all of the user's check-ins dated today, including archived habits
  and habits no longer scheduled today, so it always agrees with `total_xp` (A15).
- `scoring.xp_progress(total_xp)` pure helper returning
  `(level, xp_into_level, xp_for_next_level)`; levels are the Step 6 values and the bar
  bounds are `100*(L-1)^2` and `100*L^2 - 100*(L-1)^2`.
- Batched reads (members, scheduled habits, check-in dates, today's check-in rows,
  per-user XP sums), so a two-user dashboard runs a handful of queries with no N+1.
- Timezone: the dashboard date, weekday selection and both blocks follow
  `couples.timezone`; there is no server-time fallback.

### Files touched

`backend/app/services/dashboard_service.py`, `backend/app/routes/dashboard.py`,
`backend/app/services/scoring.py`, `backend/app/__init__.py`,
`backend/tests/integration/test_today.py`, `backend/tests/unit/test_scoring.py`,
`CHANGELOG.md`.

### Tests added

- 18 new tests (159 total): 7 `xp_progress` cases and 11 Today integration tests.
- `test_today.py`: solo couple (`partner: null`, empty progress block, exact user object);
  scheduled rows with previews, `checkin_points: null`, and habit objects equal to
  `GET /api/habits`; an undone habit whose preview matches the real check-in endpoint
  (yesterday's 10-point check-in gives preview 11, the real check-in awards 11, and the
  row then reports done with 11); archived habit hidden while its points still count in
  `today_points` and `total_xp`; habit scheduled for tomorrow absent; full couple with a
  separate read-only partner block (level, XP, today points, owner id, no email); level
  fields at 399 and 400 XP from a seeded historical check-in; `401` and `409 no_couple`;
  another couple's habits and points invisible; freezegun Tokyo case where
  2026-10-25 23:30 UTC shows Monday 2026-10-26 and only the Monday habit.
- `test_scoring.py`: `xp_progress` at 0, 99, 100, 399, 400, 450 and 900.

### Approved deviations / decisions

- **`points_if_done` equals `checkin_points` once the habit is done** (owner-approved).
  This corrects the PLAN section 7 example, which pairs `done: true` with
  `points_if_done: 11` and `checkin_points: 10`; section 2 cannot produce that pair
  (a streak-2 check-in is worth 11, so the stored check-in would also be 11). The
  endpoint reports the points actually earned.
- **`today_points` includes archived and off-schedule check-ins** (owner-approved) so it
  stays consistent with `total_xp`; such habits remain absent from `habits` per
  section 7.
- **`xp_progress` added to `services/scoring.py`** (owner-approved) as a pure,
  unit-tested helper; section 10 already assigns "xp progress" to that module.
- **Habit rows are ordered `created_at ASC, id ASC`** (owner-approved), matching
  `GET /api/habits`.
- **The partner `user` object carries only `id` and `display_name`**
  (owner-approved); email is never exposed.
- **Extra query parameters are ignored** because the endpoint has none, matching
  `GET /api/couple` (owner-approved).
- **The Today UI is Step 12, not Step 13** (planning-reference correction; no code
  impact).

### Implementation notes

- No model, migration, dependency, config or rate-limit changes; `flask db check`
  reports "No new upgrade operations detected." and the development database is
  unchanged.
- All level/XP values are derived at read time (no stored columns);
  `total_xp = SUM(checkins.points)` includes archived habits.
- The preview and the real check-in share the same pure functions, so they cannot
  drift; the owner-requested comparison test pins that behaviour.
- `ruff check` and `ruff format --check` pass; the full suite (159 tests) passes against
  PostgreSQL 16.

## Step 8 — Weekly duel (F7) — 2026-10-25

### Added

- `GET /api/duel/current` (session + couple; `401 unauthenticated`, `409 no_couple`)
  returning `week_start`, `week_end`, `days_left` (`7 - today.weekday()`, so Sunday is 1),
  `me` and `partner` blocks (`user_id`, `display_name`, points and check-in count for the
  couple-local week), `leader` (`me`, `partner`, `tie`, or `me` when solo) and the
  all-time `tally` of finalized weeks.
- `GET /api/duel/history?limit=12` returning finalized weeks newest first with
  `me_points`, `partner_points` and `result` from the caller's perspective; `limit` is
  validated by a pydantic model (1–52, `extra="forbid"`), so `0`, `53`, `abc` and
  unknown parameters are `422 validation_error`.
- `weekly_results` model and migration `5dd2a18ba9e4`: identity PK, `couple_id`
  (`ON DELETE CASCADE`), `week_start` date, `user_a_*`/`user_b_*` points, nullable
  `winner_user_id` (NULL = tie), `finalized_at`, and
  `UNIQUE (couple_id, week_start)`.
- `services/duel_service.py`: lazy finalization, live week aggregates, tally and history.
  Both endpoints finalize first (F7: "the next call to `/api/duel/current` or
  `/api/duel/history`"), so history is correct on its own.
- `timeutil.week_start(day)` / `week_end(day)` returning that week's Monday/Sunday.
- Batched reads: members, one week aggregate for the live week, and one week-grouped
  aggregate (`date_trunc`) for all missing past weeks.

### Migration

- Revision `5dd2a18ba9e4` creates `weekly_results`.
- Verified from a clean `duohabits_migration_check` database: `flask db upgrade` ran all
  four revisions from zero, `flask db check` reported no drift, and `\d weekly_results`
  confirmed the unique constraint, the four FKs and the defaults. The temporary database
  was dropped afterwards. The development database is at `5dd2a18ba9e4` (head).

### Files touched

`backend/app/models/{weekly_result,__init__}.py`,
`backend/app/services/{timeutil,duel_service}.py`, `backend/app/schemas/duel.py`,
`backend/app/routes/duel.py`, `backend/app/__init__.py`,
`backend/migrations/versions/5dd2a18ba9e4_create_weekly_results.py`,
`backend/tests/unit/test_timeutil.py`, `backend/tests/integration/test_duel.py`,
`CHANGELOG.md`.

### Tests added

- 26 new tests (185 total): 14 `timeutil` cases and 12 duel integration tests.
- U5: `week_start`/`week_end` for every weekday, month/year edges (including a leap day),
  Sunday 23:30 and Monday 00:30 Casablanca (the freeze instants are derived from the
  zone, so they do not depend on the tzdata offset).
- I10: live points/counts/leader/`days_left` from both partners' perspective; live tie;
  solo couple (`partner: null`, `leader: "me"`, zero tally, empty history); `401`/`409`;
  finalize-once across repeated `/current` and `/history` calls; a scored win stored with
  `winner_user_id` set; a scored tie and 0-0 weeks stored with `winner_user_id = NULL`;
  history newest-first and `limit` 1/12/52 plus five invalid values and an unknown
  parameter; `/history` alone finalizes; partner joining late (weeks 1–2 never stored);
  Sunday-night to Monday rollover; two-thread concurrent finalize (committed rows with
  unique emails, cleanup in `finally`) leaving exactly one row.
- Point 6 is asserted on every stored row in the finalize test: `user_a_id < user_b_id`
  and `user_a_id`/`user_b_id` are the lower/higher member ids.

### Approved deviations / decisions

- **Grace period instead of finalizing on Monday** (owner-approved): week W is stored only
  once `today >= week_end(W) + 2`, i.e. from Tuesday. This is a deliberate deviation from
  F7's wording ("when a week has passed") because A14 allows logging yesterday, so on
  Monday a Sunday check-in can still land in W; Phase 2 coin awards make later recompute
  unsafe. Tests pin Monday "not finalized" and Tuesday "finalized".
- **History starts at the latest of `couples.created_at`, member 1 `users.created_at` and
  member 2 `users.created_at`** (owner change; stricter than F7's "week containing
  `couples.created_at`"), so weeks before the partner existed are never stored as wins.
  A test where the partner joins in week 3 asserts no rows for weeks 1–2.
- **Solo couples store no rows** (`weekly_results` needs both user FKs): `/current`
  returns `partner: null`, `leader: "me"` and a zero tally; history stays empty.
- **`schemas/duel.py` added** for the `limit` query model (§9 requires pydantic query
  validation; mirrors `HabitListQuery`).
- **Both endpoints finalize** (F7 §142), and finalized rows are immutable: there is no
  recompute path for a week that already has a row.
- **`user_a_id < user_b_id` is enforced in the service only** (owner-approved); no extra
  CHECK constraint beyond section 6.
- **`days_left` is computed inline** as `7 - today.weekday()` rather than adding another
  time utility.

### Implementation notes

- Idempotency under concurrency relies on `INSERT ... ON CONFLICT (couple_id, week_start)
  DO NOTHING`; missing weeks are computed from one grouped aggregate, inserted in one
  statement in ascending week order.
- The duel week and `week_start`/`week_end` follow `couples.timezone`; `created_at`
  timestamps are converted to the couple timezone before deriving the first week.
- Freezegun and Flask sessions: pytest sets fixtures up before a `freeze_time` decorator
  starts, so cookies signed at real time are invalid when validated against a past frozen
  clock. Duel tests therefore create users/couples inside the frozen block (or nest a
  second freeze for the Monday/Tuesday transition).
- `ruff check` and `ruff format --check` pass; the full suite (185 tests) passes against
  PostgreSQL 16.

## Step 9 — Frontend scaffold and auth screens (F1 UI) — 2026-10-25

### Added

- `frontend/`: Vite 5 + React 18 + TypeScript SPA with Tailwind, TanStack Query and React
  Router (`/login`, `/register`, `/`), styled dark and mobile-first (44 px tap targets,
  labels, `autoComplete`, `aria-invalid`, `aria-describedby`, `role="alert"`).
- `src/api/client.ts`: fetch wrapper that resolves paths against `window.location.origin`,
  uses `credentials: "same-origin"`, sends JSON headers only when there is a body, returns
  `undefined` for 204, and maps the `{"error": {...}}` envelope to `ApiError` (`status`,
  `code`, `message`, `details`). Network failures become `ApiError(0, "network_error", …)`.
  Exports `errorMessage`/`fieldErrors` for screens.
- `src/api/types.ts` (`User`, `AuthResponse`, `ApiErrorEnvelope`) and
  `src/api/hooks.ts` (`useMe`, `useLogin`, `useRegister`, `useLogout`,
  `createQueryClient`). A 401 from any query/mutation clears the cached `["me"]`, so the
  guards redirect; `useMe` maps its own 401 to `null` instead of an error.
- Login and Register pages: zod validation, inline field errors, `invalid_credentials` →
  "Wrong email or password.", `rate_limited` → "Too many attempts, wait a minute.",
  `email_taken` on the email field, `registration_closed` as a form error, disabled/pending
  buttons ("Logging in…", "Creating account…") and a password show/hide control.
- `src/App.tsx`: `/` requires a session (401 → `/login`, preserving a `from` path so login
  returns there); signed-in users are redirected away from `/login` and `/register`; a
  failed `/me` renders an error screen with Retry instead of redirecting. A `Loading…`
  splash covers the session check.
- `src/components/Toast.tsx`: provider + `useToast` with auto-dismiss and `aria-live`; used
  for logout/network failures.
- Minimal protected placeholder at `/` (signed-in name, pairing hint, Log out) until
  Step 10 adds `AppShell`/`PairPage` and Step 12 the Today screen.
- Vite dev proxy `/api` → `http://127.0.0.1:5000` (IPv4 avoids Node resolving `localhost`
  to `::1` while Flask listens on 127.0.0.1); Vitest + Testing Library + MSW (node) with
  jsdom at `http://localhost:5173`.
- CI `frontend` job (Node 20, `npm ci`, lint, test, build) and a README frontend section,
  including the `ALLOWED_ORIGINS` requirement for browser writes.

### Auth validation parity (owner addition)

- `src/lib/validation.ts` mirrors `backend/app/schemas/auth.py` exactly: email is stripped,
  lowercased, capped at 254 characters and matched with `^[^@\s]+@[^@\s]+\.[^@\s]+$`;
  display name is stripped and 1–40 characters; the registration password is **not**
  stripped and must be 10–128 characters; the login password is not stripped and must be
  1–128 characters.

### Lockfile and clean install (owner addition)

- `frontend/package-lock.json` is committed; CI uses `npm ci`.
- Verified `npm ci` from a clean copy containing only `package.json` and
  `package-lock.json` (395 packages), then ran `esbuild 0.21.5`, `tsc 5.9.3` and
  `vite 5.4.21` from that copy.

### Files touched

`frontend/package.json`, `frontend/package-lock.json`, `frontend/index.html`,
`frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`,
`frontend/postcss.config.js`, `frontend/eslint.config.js`, `frontend/.prettierrc.json`,
`frontend/.prettierignore`, `frontend/src/{main.tsx,App.tsx,styles.css,vite-env.d.ts}`,
`frontend/src/api/{client,types,hooks}.ts`, `frontend/src/components/Toast.tsx`,
`frontend/src/pages/{LoginPage,RegisterPage}.tsx`, `frontend/src/lib/validation.ts`,
`frontend/src/tests/{setup,server}.ts`, `frontend/src/tests/helpers.tsx`,
`frontend/src/tests/{login,register,guards}.test.tsx`, `frontend/src/tests/client.test.ts`,
`.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`. No backend files changed.

### Dependencies (PLAN section 5 pins; lockfile committed)

- Resolved: react/react-dom 18.3.1, react-router-dom 6.30.6, @tanstack/react-query
  5.104.5, zod 3.25.76, vite 5.4.21, typescript 5.9.3 (from `^5.5`), tailwindcss 3.4.19,
  vitest 2.1.9, @testing-library/react 16.3.3, msw 2.15.0, jsdom 25.0.1, eslint 9.39.5,
  prettier 3.9.10.
- No new runtime backend dependencies and no backend API/config changes.

### Tests added

- 16 frontend tests in 4 files (backend suite unchanged at 185):
  - FE1 login: validation blocks the request; pending state ("Logging in…", disabled) then
    navigation; `invalid_credentials` inline; 429 copy.
  - FE1 register: validation; password reveal; `email_taken` under the email field;
    `registration_closed` form error; pending state then navigation.
  - FE2 (session half): unauthenticated `/` → `/login`; authenticated `/login` → `/`;
    protected page renders; `/me` 500 shows Retry and recovers.
  - Client: error-envelope mapping with details, network failure → status 0, 204 →
    `undefined`.

### Approved deviations / decisions

1. **No-couple guard deferred to Step 10** (owner-approved): `PairPage` is created there;
   Step 9 ships the auth guard and a protected placeholder at `/`.
2. **PWA deferred to Step 14** (owner-approved): no `vite-plugin-pwa`, manifest or icons in
   this step.
3. **PLAN-pinned versions** (owner-approved): React 18, Vite 5, Vitest 2, Tailwind 3,
   MSW 2, ESLint 9; CI uses Node 20. Local Node 24.19 ran Vite 5.4.21 and Vitest 2.1.9
   without problems, so no major bumps were needed or made.
4. **`src/lib/validation.ts` created now** (owner-approved) for the auth zod schemas;
   Step 11 extends it.
5. **Test scope extended** (owner-approved): register states, guard redirects and client
   error mapping in addition to the three required login states. The no-couple half of FE2
   stays in Step 10.
6. **Protected placeholder with Log out** (owner-approved) to verify the full session
   round-trip; no `AppShell` or tab bar yet.
7. **`ALLOWED_ORIGINS` is a local setup requirement** (owner-approved; docs only): browser
   writes carry `Origin: http://localhost:5173`, so `.env` must allow it. The Vite proxy
   targets `127.0.0.1` to avoid Node's IPv6 `localhost` resolution on Windows.
8. **Auth copy mapping** (owner-approved): `rate_limited` uses the section 8 wording rather
   than the backend's generic message; other codes use the server message.
9. **CI gates lint, tests and build** (owner-approved); `format:check` is available and was
   run locally but is not a CI gate, matching the backend's `ruff format` treatment.

### Implementation notes

- Both routers opt into the React Router v7 future flags (`v7_startTransition`,
  `v7_relativeSplatPath`) to remove deprecation warnings now.
- Local npm 11.17 blocks install scripts by default and printed `allow-scripts` warnings
  for `esbuild`/`msw`; both tools were still verified working. CI's npm 10 runs them.
- `npm run format:check`, `npm run lint` and `npm run typecheck` pass; `npm test` is 16/16;
  `npm run build` emits `dist/` (272 kB JS / 81 kB gzip, 11 kB CSS / 3 kB gzip).
- Smoke test through the Vite proxy with `Origin: http://localhost:5173`: register 201 →
  `/me` 200 → logout 204 → `/me` 401 → login 200 → `/me` 200. The temporary user was
  deleted from the dev database and both dev servers were stopped afterwards.
- Backend `ruff check`, `ruff format --check` and 185 tests still pass; `flask db check`
  is unaffected (no backend changes).



