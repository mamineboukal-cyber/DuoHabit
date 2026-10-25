# DuoHabits

A private, two-person, game-style habit tracker: shared accountability, XP and levels,
streaks, and a weekly head-to-head duel. The full specification is in [`PLAN.md`](PLAN.md).

Repository layout: `backend/` (Flask API), `frontend/` (React SPA, added in Step 9),
`docker-compose.yml` (local Postgres 16), `PLAN.md` (source of truth).

## Requirements

- Python **3.14** (the plan targets 3.12; 3.14 was approved by the owner — see `CHANGELOG.md`)
- Docker + Docker Compose (local PostgreSQL 16)
- Node 20 LTS for the frontend (CI uses 20; Node 24 is also verified locally)

## Local setup

1. Start PostgreSQL and create the test database:

   ```bash
   docker compose up -d db
   docker compose exec db createdb -U duohabits duohabits_test
   ```

2. Create the environment file at the repository root and edit it:

   ```bash
   cp .env.example .env
   ```

   Generate a real `SECRET_KEY` (at least 32 characters) with:

   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

3. Create a virtual environment and install dependencies:

   ```bash
   cd backend
   python -m venv .venv
   # Windows (PowerShell)
   .venv\Scripts\Activate.ps1
   # macOS / Linux
   source .venv/bin/activate

   pip install -r requirements.txt -r requirements-dev.txt
   ```

4. Apply migrations and run the API:

   ```bash
   # from backend/
   flask --app wsgi db upgrade
   flask --app wsgi run --port 5000
   ```

   Verify: <http://localhost:5000/api/health> returns `{"status":"ok"}`.

   The `.env` file is loaded explicitly from the repository root by `app/config.py`,
   so the app can be started from `backend/`.

## Tests and lint

```bash
cd backend
ruff check .
pytest
```

`TEST_DATABASE_URL` points at `duohabits_test` (created in step 1 above). CI uses a
PostgreSQL 16 service container.

## Frontend

The SPA lives in `frontend/` (React, Vite, TypeScript, Tailwind).

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173> and start the API first. The dev server proxies `/api` to
`http://127.0.0.1:5000`.

Browser writes send `Origin: http://localhost:5173`, so `ALLOWED_ORIGINS` in `.env` must
contain it. The `.env.example` default does; a backend started without `.env` has an empty
allowlist and rejects browser POSTs with `403 bad_origin`.

Checks (the first one is what CI runs from a clean checkout):

```bash
cd frontend
npm ci
npm run lint
npm run format:check
npm test
npm run build
```

## Configuration

All configuration comes from environment variables (see `.env.example`). Production
refuses to boot when `SECRET_KEY` is missing or shorter than 32 characters, or when
`DATABASE_URL` is missing. Never commit `.env`.

## Deployment

The multi-stage Docker image, gunicorn configuration and Render/Neon deployment steps
are added in Step 15.

## Runbook

- **Backups:** use `pg_dump` against the Neon connection string (documented in Step 15).
- **Data deletion:** handled by a manual SQL runbook added with the deployment step.
