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

