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



