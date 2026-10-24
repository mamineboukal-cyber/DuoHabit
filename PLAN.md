# DuoHabits: Implementation Plan

## 1. Overview

**DuoHabits** is a private, two-person, game-style habit tracker. Exactly two people (you and your girlfriend) pair into one "couple" using an invite code. Each person tracks their own habits; both can see each other's progress. Every completed habit earns points, streaks multiply those points, points become XP and levels, and each Monday-to-Sunday week is a head-to-head "duel" where the higher scorer wins. Phase 2 adds badges, a coin economy with a reward shop (you offer each other real-life rewards like "she picks the movie"), cooperative weekly team goals, nudges, push reminders and charts. The UI is responsive for both phones and laptops.

- **Target users:** one couple (2 users). Not a public social network.
- **Core value:** shared accountability plus friendly competition, with a game feel (XP, levels, streaks, duels, badges).

## 2. Assumptions & Decisions

The constraints block was left as placeholders, so these defaults apply. Tell the owner if any is wrong.

| # | Assumption / Decision | Justification |
|---|---|---|
| A1 | Platform: mobile-first **web app, installable as a PWA** | One codebase, works on both phones, no app-store cost |
| A2 | Backend: **Python 3.12 + Flask 3** | Boring, well-documented, familiar to the owner |
| A3 | DB: **PostgreSQL 16** | Relational data, array and partial-index support, free hosted tiers |
| A4 | Frontend: **React 18 + TypeScript + Vite + Tailwind** | Mainstream, fast dev loop, mobile-friendly styling |
| A5 | Free tiers only: **Render** (web service) + **Neon** (Postgres) | Zero cost; one deployable unit |
| A6 | Solo developer working with an AI coding agent, about 4 weeks part-time | MVP is sized to finish in 15 one-session steps |
| A7 | Exactly 2 users per couple, enforced server-side | Matches "connect only with my girlfriend" |
| A8 | Registration is restricted by an `ALLOWED_EMAILS` allowlist when set | Prevents strangers from using the app |
| A9 | Auth: email + password, server session cookie (Flask-Login), `argon2-cffi` hashing | Simplest secure option; no third-party dependency |
| A10 | Language: English UI only, no i18n in MVP | Keep MVP minimal |
| A11 | Week = Monday 00:00 to Sunday 23:59:59 in the **couple timezone** (default `Africa/Casablanca`) | Both partners share one definition of "today" and "this week" |
| A12 | Habits are boolean (done / not done) per scheduled day in MVP | Numeric habits add UI and scoring complexity |
| A13 | All habits are visible to the partner, with no private habits | The point is shared competition |
| A14 | Check-ins are allowed for **today and yesterday** (couple timezone) only | Allows late logging without enabling large backfilling |
| A15 | Points are fixed when a check-in is created and are never recomputed later | Keeps scoring simple and deterministic |
| A16 | "Live" updates via **polling every 15 s** (TanStack Query `refetchInterval`) | No websocket infrastructure needed |
| A17 | Scheduled reminders (Phase 2) via a **GitHub Actions cron** calling a secret-protected endpoint | Render free tier has no cron |
| A18 | Single deployable Docker image: gunicorn serves the API and the built React files | One service, no CORS, same-origin cookies |
| A19 | Pydantic v2 for request validation | Strict, explicit validation errors |
| A20 | Scoring formula (see below) | Explicit so tests are exact |
| A21 | UI is **responsive**: bottom tab bar under 768 px, left sidebar with a two-column Today view at 768 px and above | Owner uses it on phones and laptops |
| A22 | Competition = weekly duel **plus cooperative weekly team goals** | Owner chose "mix with team goals" |
| A23 | Phase 2 priority: badges, then coins and reward shop, then team goals | Owner picked badges and coins/shop as the wanted game features |
| A24 | Coins are earned only through play (rules below) and are spent on **rewards the partner offers you** (e.g. "30 coins = she picks the movie"); cosmetics/avatars are Later | Real-life rewards fit a couple; avoids art workload |
| A25 | Streaks are strict in MVP (no freezes); habits are boolean | Keep MVP minimal; revisit after real use |
| A26 | No handicap system; difficulty is self-chosen, and the weekly duel stays points-based | Simplest fair default; flagged in open questions |
| A27 | Look and feel: colorful, game-like, with animations (XP bar, "+N XP", confetti), no sound in MVP | Matches "game-like experience" request |
| A28 | Weekly stakes (loser-pays bets) are demoted to Later because the coin shop covers real-life rewards | Avoid two overlapping reward systems |

### Coin rules (Phase 2, authoritative)

- Check-in: `+difficulty` coins (1, 2 or 3).
- Weekly duel win: `+25` coins to the winner (tie: `+10` each).
- Badge earned: `+10` coins.
- Team goal completed: `+50` coins to **each** partner.
- Undoing a check-in removes its coins (the balance may not go below 0; if coins were already spent, the ledger row is removed and the balance is clamped at 0 on display, while `GET /api/coins` reports the true signed sum in `balance_raw`).
- Spending: a reward purchase creates a negative ledger row. A user cannot buy a reward when `balance < price` (409 `insufficient_coins`).
- Migration for Phase 2 backfills coins for all existing check-ins and finalized duels (idempotent via the unique key on the ledger).

### Team goal rules (Phase 2, authoritative)

- One team goal per couple per week (Monday-Sunday), chosen by either partner by Wednesday of that week, or auto-assigned `combined_points` on Monday if none exists.
- Types: `combined_points` (target N = combined weekly points of both users, allowed 50-2000) and `perfect_days_together` (target K = number of days, 1-7, on which **both** users completed all their scheduled habits; a user with zero scheduled habits that day counts as complete only if the other has at least one).
- Progress is computed live; status becomes `completed` the moment the target is met, and `missed` when the week is finalized without meeting it.

### Scoring and level rules (authoritative)

- `base_points = 10 * difficulty` (difficulty 1, 2 or 3, so 10, 20 or 30).
- `streak_at_checkin` = number of consecutive **scheduled** days, ending on the check-in date, that have a check-in (including this one). Unscheduled days are skipped and never break a streak.
- `multiplier = 1 + 0.1 * min(streak_at_checkin - 1, 5)` (range 1.0 to 1.5).
- `points = round(base_points * multiplier)` (Python `round`, but use `int(base_points * multiplier + 0.5)` to avoid banker's rounding).
- `total_xp(user) = SUM(checkins.points)` for that user.
- `level = floor(sqrt(total_xp / 100)) + 1`. XP needed to reach level L is `100 * (L-1)^2`.
- **Current streak** of a habit: walk backwards over scheduled days starting from the most recent scheduled day on or before today. If that day is today and it is not yet done, start from the previous scheduled day instead (today is still "pending"). Count consecutive done days.
- **Best streak** = max of the longest consecutive-scheduled-day run in history and the stored value (never decreases).
- **Weekly duel:** `weekly_points(user, week) = SUM(points)` of that user's check-ins with `checkin_date` in the week. Higher total wins; equal totals (including 0-0) are a tie.

## 3. Features

IDs are used for traceability in sections 11 and 12.

### MVP

**F1. Account registration, login, logout**
- *Description:* Email and password accounts with a display name.
- *User story:* As a user, I want to create an account and log in so my data is private to me.
- *Acceptance criteria:*
  - Registering with a valid email, display name (1-40 chars) and password (min 10 chars) returns 201 and starts a session.
  - A duplicate email (case-insensitive) returns 409 `email_taken`.
  - If `ALLOWED_EMAILS` is set and the email is not in it, registration returns 403 `registration_closed`.
  - Login with wrong credentials returns 401 `invalid_credentials` with an identical message for unknown email and wrong password.
  - After logout, `GET /api/auth/me` returns 401.
  - More than 10 auth requests per minute from one IP returns 429.

**F2. Couple pairing**
- *Description:* One user creates a couple and receives an 8-character invite code; the partner joins with it. A couple holds at most 2 users.
- *User story:* As a user, I want to link only with my girlfriend so only she sees my habits.
- *Acceptance criteria:*
  - `POST /api/couple` creates a couple, attaches the caller, and returns an invite code. A user already in a couple gets 409 `already_in_couple`.
  - `POST /api/couple/join` with a valid code attaches the caller as the second member.
  - Joining a full couple returns 409 `couple_full`; an unknown code returns 404 `invalid_code`.
  - Two concurrent joins on a one-seat couple result in exactly one success.
  - A user can never read data belonging to any couple other than their own (403/404).
  - The couple timezone can be changed by either member to any valid IANA name; invalid names return 422.

**F3. Habit management**
- *Description:* Create, edit, archive habits with name, emoji, difficulty (1-3) and schedule days.
- *User story:* As a user, I want to define my habits and how hard they are so scoring is fair.
- *Acceptance criteria:*
  - Create with `name` (1-60 chars), optional `emoji`, `difficulty` 1-3, `schedule_days` (non-empty subset of 0-6, 0 = Monday); invalid input returns 422 with per-field details.
  - Two active habits of one user cannot share a name (case-insensitive): 409 `habit_name_taken`.
  - Editing is allowed only by the owner; the partner gets 403.
  - "Delete" is an archive (`archived_at` set); archived habits disappear from lists but their check-ins and points remain.
  - Changing `difficulty` affects only future check-ins.

**F4. Daily check-in with points**
- *Description:* Mark a scheduled habit done for today or yesterday; undo is allowed.
- *User story:* As a user, I want to tap a habit to mark it done and see points awarded.
- *Acceptance criteria:*
  - `POST /api/habits/{id}/checkins` with `{date}` creates a check-in with points per section 2 and returns the check-in and updated habit streaks.
  - A date that is not today or yesterday (couple timezone) returns 422 `date_out_of_range`; a date not in `schedule_days` returns 422 `not_scheduled`.
  - A second check-in for the same habit and date returns 409 `already_checked_in`.
  - Only the habit owner can check in (partner gets 403).
  - `DELETE /api/habits/{id}/checkins/{date}` removes it and recomputes the habit's streak cache; a missing check-in returns 404.

**F5. Streaks**
- *Description:* Per-habit current and best streak, computed by the rules in section 2.
- *User story:* As a user, I want streaks so I feel motivated not to break the chain.
- *Acceptance criteria:*
  - Daily habit with 3 consecutive done days gives `current_streak = 3`.
  - A habit scheduled Mon/Wed/Fri done on Mon, Wed, Fri gives streak 3 (unscheduled days do not break it).
  - Today scheduled but not yet done does not reset the streak.
  - A missed scheduled day resets the current streak to 0 (or to the run since then), and `best_streak` is preserved.

**F6. XP and levels**
- *Description:* Total XP and level for each user, with progress to the next level.
- *User story:* As a user, I want to level up so progress feels like a game.
- *Acceptance criteria:*
  - 0 XP gives level 1; 100 XP gives level 2; 400 XP gives level 3; 399 XP gives level 2.
  - Undoing a check-in lowers total XP by exactly the points it awarded.

**F7. Weekly duel**
- *Description:* Live head-to-head scoreboard for the current week plus history and an all-time win tally.
- *User story:* As a user, I want to see who is winning this week and the all-time record.
- *Acceptance criteria:*
  - `GET /api/duel/current` returns both users' weekly points, leader (`me`, `partner` or `tie`), days left, and tally.
  - When a week has passed, the next call to `/api/duel/current` or `/api/duel/history` finalizes it into `weekly_results` exactly once (idempotent under concurrent calls).
  - Winner is the higher total; equal totals are `winner_user_id = NULL`.
  - Weeks before the couple existed and weeks with no row are never invented (history starts at the week containing `couples.created_at`).

**F8. Partner view (read-only)**
- *Description:* The Today screen shows the partner's scheduled habits, done state, streaks, level and today's points.
- *User story:* As a user, I want to see what my girlfriend completed today.
- *Acceptance criteria:*
  - `GET /api/today` returns `me` and `partner` blocks; no write endpoint accepts the partner's habit IDs from the caller.
  - A user with no partner yet gets `partner: null`.

**F9. Settings**
- *Description:* Change display name, timezone, view the invite code, log out.
- *User story:* As a user, I want to manage my profile and couple settings.
- *Acceptance criteria:*
  - `PATCH /api/auth/me` updates `display_name` (1-40 chars).
  - Invite code is shown only while the couple has fewer than 2 members.

### Phase 2

**F10. Badges.** Fixed catalogue of 8 badges, awarded automatically.
- Story: As a user I want to unlock badges for milestones.
- Catalogue (code: criterion): `first_step`: first check-in; `streak_7`: any habit current streak reaches 7; `streak_30`: reaches 30; `perfect_day`: all scheduled habits done on one day (min 2 habits); `perfect_week`: perfect day on every day of a week; `duel_win_1`: first weekly duel win; `duel_win_5`: 5 duel wins; `level_5`: reach level 5.
- AC: each badge is awarded at most once per user (unique constraint); awarding happens in the same transaction as the triggering check-in; undoing a check-in does **not** revoke a badge; `GET /api/badges` lists all badges with `earned_at` per user.

**F11. Perfect-day bonus.** +20 XP when a user completes all habits scheduled that day (min 2).
- Story: As a user I want a bonus for finishing everything.
- AC: stored in `xp_events` with unique `(user_id, kind, ref_date)`; created on the check-in that completes the day; deleted if an undo makes the day incomplete; `total_xp = SUM(checkins.points) + SUM(xp_events.points)`.

**F12. Nudges and cheers.** Send a 140-char message or a preset cheer to the partner.
- Story: As a user I want to poke or cheer my partner.
- AC: max 10 nudges per user per day (429 `nudge_limit`); recipient sees unread nudges on Today; marking read sets `read_at`.

**F13. Coins and reward shop.** Coins are earned per the coin rules in section 2; each partner can create rewards for the other to buy.
- Story: As a user I want to earn coins and spend them on rewards my partner offers, so effort turns into real treats.
- AC:
  - `GET /api/coins` returns balance and the last 50 ledger entries; balance equals the signed sum of the ledger.
  - A reward has a title (1-60 chars), optional description (max 140), price 1-1000; only the creator can edit or deactivate it, and a creator cannot buy their own reward (403).
  - Buying creates a purchase with status `pending` and a negative ledger row in one transaction; insufficient coins returns 409 `insufficient_coins`; two simultaneous buys can never overdraw (row lock on the buyer's user row).
  - Only the reward creator can mark a purchase `fulfilled`; the buyer sees the status.
  - Undoing a check-in, duel win or badge cannot create duplicate coin rows (unique `(user_id, kind, ref_key)`).

**F22. Weekly team goals.** One shared cooperative goal per week per the team goal rules in section 2.
- Story: As a user I want a goal we beat together so we also cheer for each other, not only compete.
- AC:
  - `GET /api/team-goal/current` returns type, target, progress, status and days left.
  - Either partner can set or change the goal until it is `completed`, but only on or before Wednesday (couple timezone); afterwards 409 `goal_locked`.
  - Progress matches live check-in data in tests for both goal types, including a partner with no scheduled habits.
  - On first reaching the target both partners get +50 coins exactly once (unique ledger key).
  - A week finalized without success sets `missed`; no coins awarded.

**F14. Web push reminders.** Evening reminder if habits remain, and a push when the partner nudges you.
- Story: As a user I want reminders so I do not forget.
- AC: a subscription is stored per device (unique endpoint); the reminder endpoint requires header `X-Cron-Secret`; reminders are sent at 20:00 couple time only to users with incomplete scheduled habits; expired subscriptions (HTTP 404/410) are deleted.

**F15. Activity feed.** Chronological list of recent events (check-ins, badges, level-ups, duel results).
- AC: returns last 50 events of both users, newest first, derived from existing tables (no separate event table).

**F16. Stats and charts.** Per-user weekly points chart (last 8 weeks) and completion-rate per habit (last 30 days).
- AC: values match the SQL aggregates in tests; empty ranges return zeros, not errors.

### Later (not planned in detail)

- **F17 Co-op habits:** a shared habit both must complete for team points.
- **F18 Seasons:** monthly seasons with reset leaderboards and trophy history.
- **F19 Avatars/themes:** unlockable cosmetics bought with coins.
- **F20 Numeric habits:** target counts such as "8 glasses of water".
- **F21 Native wrapper:** Capacitor build for the app stores.
- **F23 Weekly stakes:** a free-text bet per week ("loser cooks dinner"); dropped from Phase 2 because the coin shop covers real-life rewards (A28).

## 4. Architecture

Components:
1. **Browser SPA (React PWA):** UI, server-state cache (TanStack Query), service worker (Phase 2 for push).
2. **Flask API:** auth, domain services (scoring, streaks, duel), JSON over HTTPS under `/api`.
3. **PostgreSQL:** all state.
4. **GitHub Actions cron (Phase 2):** calls `/api/internal/reminders`.
5. **Web Push service (Phase 2):** browser vendor push endpoints, called via `pywebpush`.

Communication: SPA to API via same-origin `fetch` with the session cookie. The API reads and writes Postgres through SQLAlchemy. The SPA polls `/api/today` and `/api/duel/current` every 15 s while the tab is visible.

```
 [Phone/Browser: React PWA] --HTTPS, same origin, cookie--> [Render: gunicorn + Flask]
        ^                                                      |        |
        | polling 15s                                          |        | pywebpush (Phase 2)
        |                                              SQLAlchemy|        v
        |                                                      v   [Browser push services]
        |                                              [Neon: PostgreSQL 16]
 [GitHub Actions cron, 20:00 daily (Phase 2)] --POST /api/internal/reminders + X-Cron-Secret--> Flask

 Flask internals:
   routes (blueprints) -> schemas (pydantic) -> services (scoring, streaks, duel) -> models (SQLAlchemy)
```

Layering rule: routes contain no business logic; all scoring, streak and duel logic lives in `services/` as pure functions where possible (unit-testable without a DB).

## 5. Tech Stack

**Backend** (Python 3.12; pin in `requirements.txt` using `~=`):
- Flask ~=3.0, Flask-SQLAlchemy ~=3.1, SQLAlchemy ~=2.0, Flask-Migrate ~=4.0, Flask-Login ~=0.6, Flask-Limiter ~=3.8, pydantic ~=2.9, psycopg[binary] ~=3.2, argon2-cffi ~=23.1, gunicorn ~=23.0, python-dotenv ~=1.0, pywebpush ~=2.0 (Phase 2).
- Dev: pytest ~=8.3, pytest-cov ~=5.0, ruff ~=0.6 (lint + format), freezegun ~=1.5 (time control in tests).
- Package manager: `pip` + `venv`; tests run against a real Postgres (service container in CI), not SQLite.

**Frontend** (Node 20 LTS, **npm**):
- react ^18.3, react-dom ^18.3, react-router-dom ^6.26, @tanstack/react-query ^5.56, typescript ^5.5, vite ^5.4, tailwindcss ^3.4, postcss, autoprefixer, vite-plugin-pwa ^0.20, recharts ^2.12 (Phase 2), zod ^3.23 (client-side form validation).
- Dev: vitest ^2.1, @testing-library/react ^16, @testing-library/user-event ^14, msw ^2.4 (API mocking), eslint ^9 + typescript-eslint, prettier ^3.

**Tooling/CI:** GitHub Actions (backend tests with Postgres service, frontend tests, lint). Docker multi-stage build.

## 6. Data Model

PostgreSQL 16. All timestamps are `timestamptz` stored in UTC. All primary keys are `bigint GENERATED ALWAYS AS IDENTITY`. Dates are `date` in the couple's timezone.

### MVP tables

**users**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK |
| email | varchar(254) | NOT NULL, UNIQUE (stored lowercased) |
| password_hash | varchar(255) | NOT NULL |
| display_name | varchar(40) | NOT NULL, CHECK length >= 1 |
| couple_id | bigint | NULL, FK couples(id) ON DELETE SET NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Indexes: unique(email); index(couple_id).

**couples**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK |
| invite_code | char(8) | NOT NULL, UNIQUE; alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| timezone | varchar(64) | NOT NULL DEFAULT 'Africa/Casablanca' |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Relationship: couples 1 to 0..2 users. The 2-member limit is enforced in the join service by locking the couple row (`SELECT ... FOR UPDATE`) and counting members.

**habits**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK |
| owner_id | bigint | NOT NULL, FK users(id) ON DELETE CASCADE |
| couple_id | bigint | NOT NULL, FK couples(id) ON DELETE CASCADE |
| name | varchar(60) | NOT NULL, CHECK length >= 1 |
| emoji | varchar(8) | NULL |
| difficulty | smallint | NOT NULL DEFAULT 1, CHECK between 1 and 3 |
| schedule_days | smallint[] | NOT NULL DEFAULT '{0,1,2,3,4,5,6}', CHECK cardinality >= 1 AND `schedule_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]` |
| current_streak | integer | NOT NULL DEFAULT 0, CHECK >= 0 |
| best_streak | integer | NOT NULL DEFAULT 0, CHECK >= 0 |
| archived_at | timestamptz | NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

Indexes: index(owner_id, archived_at); index(couple_id); **partial unique** `(owner_id, lower(name)) WHERE archived_at IS NULL`.

**checkins**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK |
| habit_id | bigint | NOT NULL, FK habits(id) ON DELETE CASCADE |
| user_id | bigint | NOT NULL, FK users(id) ON DELETE CASCADE |
| checkin_date | date | NOT NULL |
| points | integer | NOT NULL, CHECK > 0 |
| streak_at_checkin | integer | NOT NULL, CHECK >= 1 |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Indexes: **unique(habit_id, checkin_date)**; index(user_id, checkin_date).

**weekly_results**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK |
| couple_id | bigint | NOT NULL, FK couples(id) ON DELETE CASCADE |
| week_start | date | NOT NULL (a Monday) |
| user_a_id | bigint | NOT NULL, FK users(id) |
| user_a_points | integer | NOT NULL DEFAULT 0 |
| user_b_id | bigint | NOT NULL, FK users(id) |
| user_b_points | integer | NOT NULL DEFAULT 0 |
| winner_user_id | bigint | NULL, FK users(id); NULL means tie |
| finalized_at | timestamptz | NOT NULL DEFAULT now() |

Indexes: **unique(couple_id, week_start)** (finalize uses `INSERT ... ON CONFLICT DO NOTHING`). `user_a_id` is the lower user id.

### Phase 2 tables

**badges**: `code varchar(32) PK`, `name varchar(60) NOT NULL`, `description varchar(200) NOT NULL`, `icon varchar(8) NOT NULL`. Seeded by migration with the 8 badges from F10.

**user_badges**: `id PK`, `user_id FK users CASCADE`, `badge_code FK badges`, `awarded_at timestamptz DEFAULT now()`. Unique(user_id, badge_code).

**xp_events**: `id PK`, `user_id FK users CASCADE`, `kind varchar(24) NOT NULL CHECK kind IN ('perfect_day')`, `ref_date date NOT NULL`, `points integer NOT NULL`, `created_at`. Unique(user_id, kind, ref_date).

**nudges**: `id PK`, `from_user_id FK users`, `to_user_id FK users`, `kind varchar(8) CHECK IN ('nudge','cheer')`, `message varchar(140) NOT NULL`, `created_at DEFAULT now()`, `read_at NULL`. Index(to_user_id, read_at); index(from_user_id, created_at).

**coin_ledger**: `id PK`, `user_id FK users CASCADE`, `kind varchar(16) NOT NULL CHECK IN ('checkin','duel','badge','team_goal','purchase')`, `ref_key varchar(64) NOT NULL` (e.g. `checkin:123`, `duel:2026-10-19`, `badge:streak_7`, `goal:2026-10-19`, `purchase:55`), `amount integer NOT NULL CHECK amount <> 0`, `created_at`. Unique(user_id, kind, ref_key); index(user_id, created_at).

**rewards**: `id PK`, `couple_id FK couples CASCADE`, `creator_id FK users`, `title varchar(60) NOT NULL`, `description varchar(140) NULL`, `price integer NOT NULL CHECK between 1 and 1000`, `active boolean NOT NULL DEFAULT true`, `created_at`. Index(couple_id, active).

**reward_purchases**: `id PK`, `reward_id FK rewards`, `buyer_id FK users`, `price_paid integer NOT NULL`, `status varchar(10) NOT NULL CHECK IN ('pending','fulfilled') DEFAULT 'pending'`, `created_at`, `fulfilled_at NULL`. Index(buyer_id, status); index(reward_id).

**team_goals**: `id PK`, `couple_id FK couples CASCADE`, `week_start date NOT NULL`, `type varchar(24) NOT NULL CHECK IN ('combined_points','perfect_days_together')`, `target integer NOT NULL`, `status varchar(10) NOT NULL CHECK IN ('active','completed','missed') DEFAULT 'active'`, `completed_at NULL`, `created_at`. Unique(couple_id, week_start).

**push_subscriptions**: `id PK`, `user_id FK users CASCADE`, `endpoint text NOT NULL UNIQUE`, `p256dh text NOT NULL`, `auth text NOT NULL`, `created_at`. Index(user_id).

## 7. API Design

Conventions:
- Base path `/api`, JSON only (`Content-Type: application/json` required on bodies).
- Auth "session" means a valid session cookie; otherwise 401 `unauthenticated`.
- "couple" means the user must also belong to a couple; otherwise 409 `no_couple`.
- Error body for every error: `{"error": {"code": "<snake_case>", "message": "<human text>", "details": {<field>: "<msg>"} }}` (`details` optional).
- Common errors: 400 `bad_json`, 401 `unauthenticated`, 403 `forbidden`, 404 `not_found`, 422 `validation_error`, 429 `rate_limited`.
- Dates are ISO `YYYY-MM-DD`. Timestamps are ISO 8601 UTC.

### Health
- `GET /api/health` (no auth) -> 200 `{"status":"ok"}`.

### Auth
- `POST /api/auth/register` (no auth). Body `{email, password, display_name}`. 201 -> `{user}`. Errors: 403 `registration_closed`, 409 `email_taken`, 422, 429.
- `POST /api/auth/login` (no auth). Body `{email, password}`. 200 -> `{user}`. Errors: 401 `invalid_credentials`, 422, 429.
- `POST /api/auth/logout` (session). 204.
- `GET /api/auth/me` (session). 200 -> `{user}`.
- `PATCH /api/auth/me` (session). Body `{display_name}`. 200 -> `{user}`. Errors: 422.

`user` object: `{id, email, display_name, couple_id|null}`.

### Couple
- `POST /api/couple` (session). Body `{timezone?}`. 201 -> `{couple}`. Errors: 409 `already_in_couple`, 422 invalid timezone.
- `POST /api/couple/join` (session). Body `{invite_code}`. 200 -> `{couple}`. Errors: 404 `invalid_code`, 409 `couple_full`, 409 `already_in_couple`, 422.
- `GET /api/couple` (session + couple). 200 -> `{couple}`.
- `PATCH /api/couple` (session + couple). Body `{timezone}`. 200 -> `{couple}`. Errors: 422.

`couple` object: `{id, timezone, invite_code|null (null when 2 members), members: [{id, display_name}], created_at}`.

### Habits
- `GET /api/habits` (session + couple). Query `owner=me|partner` (default `me`), `include_archived=false`. 200 -> `{habits: [habit]}`.
- `POST /api/habits` (session + couple). Body `{name, emoji?, difficulty (1-3, default 1), schedule_days (default [0..6])}`. 201 -> `{habit}`. Errors: 409 `habit_name_taken`, 422.
- `PATCH /api/habits/{id}` (session; owner only). Body: any subset of `{name, emoji, difficulty, schedule_days}`. 200 -> `{habit}`. Errors: 403, 404, 409 `habit_name_taken`, 422.
- `DELETE /api/habits/{id}` (session; owner only). Archives. 204. Errors: 403, 404.

`habit` object: `{id, owner_id, name, emoji, difficulty, schedule_days, current_streak, best_streak, archived_at, created_at}`.

### Check-ins
- `POST /api/habits/{id}/checkins` (session; owner only). Body `{date}`. 201 -> `{checkin: {id, habit_id, checkin_date, points, streak_at_checkin}, habit, total_xp, level}`. Errors: 403, 404, 409 `already_checked_in`, 422 `date_out_of_range`, 422 `not_scheduled`, 409 `habit_archived`.
- `DELETE /api/habits/{id}/checkins/{date}` (session; owner only). 200 -> `{habit, total_xp, level}`. Errors: 403, 404 (habit or check-in missing), 422 `date_out_of_range`.

### Dashboard
- `GET /api/today` (session + couple). 200 ->
```json
{
  "date": "2026-10-24",
  "timezone": "Africa/Casablanca",
  "me": {"user": {"id": 1, "display_name": "..."}, "level": 3, "total_xp": 450, "xp_into_level": 50, "xp_for_next_level": 500, "today_points": 30, "habits": [{"habit": {...}, "done": true, "points_if_done": 11, "checkin_points": 10}]},
  "partner": null
}
```
  `partner` has the same shape as `me` or is `null` if the couple has one member. `habits` contains only habits scheduled for today and not archived. `points_if_done` is the points that a check-in today would earn (using the streak rules); `checkin_points` is null when not done.
  Level fields: `xp_into_level = total_xp - 100*(level-1)^2`, `xp_for_next_level = 100*level^2 - 100*(level-1)^2`.

### Duel
- `GET /api/duel/current` (session + couple). Finalizes any unfinalized past weeks first. 200 ->
```json
{
  "week_start": "2026-10-19", "week_end": "2026-10-25", "days_left": 1,
  "me": {"user_id": 1, "display_name": "...", "points": 120, "checkins": 9},
  "partner": {"user_id": 2, "display_name": "...", "points": 140, "checkins": 10},
  "leader": "partner",
  "tally": {"me_wins": 3, "partner_wins": 2, "ties": 1}
}
```
  `partner` is null with one member (and `leader` is `"me"`). `days_left` counts today as 1 on Sunday.
- `GET /api/duel/history?limit=12` (session + couple). 200 -> `{weeks: [{week_start, me_points, partner_points, result: "win"|"loss"|"tie"}]}` newest first. `limit` 1-52, else 422.

### Phase 2 endpoints
- `GET /api/badges` (session). 200 -> `{badges: [{code, name, description, icon, earned_at|null}]}`.
- `GET /api/feed?limit=50` (session + couple). 200 -> `{events: [{type: "checkin"|"badge"|"level_up"|"duel_result", user_id, text, at}]}`; `limit` 1-50.
- `POST /api/nudges` (session + couple + partner). Body `{kind: "nudge"|"cheer", message (1-140)}`. 201 -> `{nudge}`. Errors: 409 `no_partner`, 422, 429 `nudge_limit`.
- `GET /api/nudges?unread=true` (session + couple). 200 -> `{nudges: [nudge]}` addressed to the caller.
- `POST /api/nudges/{id}/read` (session; recipient only). 204. Errors: 403, 404.
- `GET /api/coins` (session + couple). 200 -> `{balance, balance_raw, ledger: [{id, kind, amount, created_at}]}` (last 50).
- `GET /api/rewards` (session + couple). Query `by=partner|me` (default `partner`: rewards I can buy). 200 -> `{rewards: [reward]}` active only for `partner`.
- `POST /api/rewards` (session + couple + partner). Body `{title, description?, price}`. 201 -> `{reward}`. Errors: 409 `no_partner`, 422.
- `PATCH /api/rewards/{id}` (session; creator only). Body subset of `{title, description, price, active}`. 200 -> `{reward}`. Errors: 403, 404, 422.
- `POST /api/rewards/{id}/purchase` (session; not the creator). 201 -> `{purchase, balance}`. Errors: 403 (own reward), 404, 409 `insufficient_coins`, 409 `reward_inactive`.
- `GET /api/purchases` (session + couple). Query `role=buyer|creator`. 200 -> `{purchases: [purchase]}`.
- `POST /api/purchases/{id}/fulfill` (session; reward creator only). 200 -> `{purchase}`. Errors: 403, 404, 409 `already_fulfilled`.
- `GET /api/team-goal/current` (session + couple). 200 -> `{goal: {type, target, progress, status, days_left}|null}`.
- `PUT /api/team-goal/current` (session + couple + partner). Body `{type, target}`. 200 -> `{goal}`. Errors: 409 `goal_locked`, 409 `no_partner`, 422.
- `POST /api/push/subscriptions` (session). Body `{endpoint, keys: {p256dh, auth}}`. 201. Errors: 422.
- `DELETE /api/push/subscriptions` (session). Body `{endpoint}`. 204.
- `GET /api/stats/me?weeks=8` (session + couple). 200 -> `{weekly_points: [{week_start, points}], habit_completion: [{habit_id, name, scheduled, done, rate}]}`; `weeks` 1-26.
- `POST /api/internal/reminders` (header `X-Cron-Secret` must equal `CRON_SECRET`, else 403). 200 -> `{sent: n}`.

## 8. Frontend / UI Spec

Style: mobile-first (360-430 px), dark-friendly, large tap targets (min 44 px), bottom tab bar (Today, Habits, Duel, Settings). Game feel: XP bar with animation, confetti on level-up, "+N XP" floating text on check-in, streak flame icon.

Global rules: every data screen has **loading** (skeleton), **empty**, and **error** (message + "Retry" button) states. Network failures on mutations show a toast and roll back optimistic updates.

**Routing:** `/login`, `/register`, `/pair` (only when logged in without couple), `/` (Today), `/habits`, `/habits/new`, `/habits/:id/edit`, `/duel`, `/settings`. Unauthenticated users are redirected to `/login`; authenticated users without a couple are redirected to `/pair`.

1. **Login (`/login`)**: email, password, "Log in" button, link to register. Errors: inline "Wrong email or password"; 429 shows "Too many attempts, wait a minute".
2. **Register (`/register`)**: email, display name, password (min 10 chars, show/hide), "Create account". Errors: `email_taken`, `registration_closed` shown inline.
3. **Pair (`/pair`)**: two cards. (a) "Create our couple": timezone select (default Africa/Casablanca) and a button; on success shows the invite code in large text with a "Copy" button and the message "Waiting for your partner..." (polls `GET /api/couple` every 5 s; when a second member appears, goes to `/`). (b) "Join with a code": 8-char input (auto-uppercase) and a "Join" button. Errors: invalid code, couple full.
4. **Today (`/`)**:
   - Header: date, my level badge, XP bar (`xp_into_level / xp_for_next_level`), today's points.
   - "Me" list: one row per scheduled habit: checkbox-style big button, emoji, name, streak flame with number, points preview (`+11`). Tap toggles check-in (optimistic); long-press or "undo" icon removes. Yesterday toggle ("Yesterday" tab) allows yesterday's check-ins.
   - "Partner" section: the same rows, read-only, plus her level and today's points. Empty state if no partner ("Waiting for your partner to join").
   - Empty state for me: "No habits scheduled today" with button to `/habits/new`.
   - Polls every 15 s while the tab is visible.
5. **Habits (`/habits`)**: segmented control "Mine / Partner's". Mine: list of habits with streaks, edit and archive actions, floating "+" button. Partner's: read-only list.
6. **Habit form (`/habits/new`, `/habits/:id/edit`)**: name, emoji (text input, max 8 chars), difficulty (3 radio cards: Easy 10, Medium 20, Hard 30 base points), weekday chips (Mon-Sun, at least one selected), Save / Cancel; edit mode has "Archive habit" with a confirm dialog. Field errors displayed under inputs.
7. **Duel (`/duel`)**: top: week range and days-left. Center: two big score cards (me vs partner) with a tug-of-war bar proportional to points (50/50 at 0-0), leader crown. Below: all-time tally ("You 3 : 2 Her, 1 tie") and history list (last 12 weeks, win/loss/tie chips). Empty history: "First finished week will show up here."
8. **Settings (`/settings`)**: display name (save), timezone select, invite code (visible only while 1 member), "Log out" button.

Responsive rule (A21): below 768 px use the bottom tab bar; at 768 px and above use a left sidebar and show "Me" and "Partner" side by side on Today and the Duel cards in a two-column layout. Max content width 1100 px, centered.

Phase 2 UI: Badges screen (grid, locked/unlocked), Shop screen (coin balance, rewards I can buy, rewards I offer with add/edit, pending purchases to fulfill), team goal card with progress bar on the Duel screen (set/change until Wednesday), nudge button on partner section and unread nudge banner on Today, Feed tab, Stats screen with Recharts, notification permission prompt in Settings.

## 9. Authentication & Security

- **Auth flow:** `register` and `login` create a Flask-Login session (signed cookie `session`; `HttpOnly`, `Secure` in production, `SameSite=Lax`, lifetime 30 days, `SESSION_COOKIE_NAME="duohabits_session"`). `logout` clears it.
- **Passwords:** `argon2-cffi` `PasswordHasher()` defaults; min length 10; never logged or returned.
- **Roles/permissions:** one role (member). Authorization rules: (1) every query on habits, check-ins, duel and stakes is filtered by the caller's `couple_id`; (2) writes require `habit.owner_id == current_user.id`; (3) the partner can read but never write the caller's habits. Responses use 404 for objects in another couple (avoid revealing existence) and 403 for same-couple, wrong-owner writes.
- **Registration lock:** `ALLOWED_EMAILS` env var (comma-separated, case-insensitive). If set, any other email returns 403 on register.
- **Input validation:** every request body and query parameter is parsed by a pydantic model with `extra="forbid"`; string fields are stripped; length and range limits as in section 7.
- **SQL injection:** only SQLAlchemy ORM and bound parameters; no string-built SQL.
- **CSRF:** cookies are `SameSite=Lax` and the API is JSON-only. A `before_request` hook additionally rejects `POST/PUT/PATCH/DELETE` when an `Origin` header is present and not in `ALLOWED_ORIGINS` (403 `bad_origin`), and requires `Content-Type: application/json` on requests with bodies (415 otherwise).
- **XSS:** React escapes by default; never use `dangerouslySetInnerHTML`; set headers `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, and `Strict-Transport-Security` in production.
- **Rate limiting:** Flask-Limiter: 10/min per IP on `/api/auth/*` and `/api/couple/join` (stops invite-code guessing; the code space is 32^8), 120/min per user on everything else. Storage: in-memory (single instance).
- **Enumeration:** login returns the same error for unknown email and wrong password.
- **Secrets:** `SECRET_KEY`, `DATABASE_URL`, `CRON_SECRET`, VAPID keys only via environment variables; `.env` is git-ignored; `.env.example` has no real values. Production boot fails if `SECRET_KEY` is missing or shorter than 32 chars.
- **Concurrency:** couple join locks the couple row; weekly finalize uses `ON CONFLICT DO NOTHING`; check-in uses the unique `(habit_id, checkin_date)` constraint and maps `IntegrityError` to 409.
- **Data deletion:** out of scope for MVP; a manual SQL runbook is included in the README.

## 10. Project Structure

```
duohabits/
├── README.md                      # Setup, run, deploy, runbook
├── CHANGELOG.md                   # Running changelog the agent updates every step
├── PLAN.md                        # This plan (source of truth)
├── .gitignore                     # Ignores venv, node_modules, .env, dist
├── .env.example                   # All env vars with dummy values
├── Dockerfile                     # Multi-stage: build frontend, run gunicorn
├── docker-compose.yml             # Local Postgres 16 for development
├── .github/workflows/
│   ├── ci.yml                     # Lint + backend tests (Postgres service) + frontend tests
│   └── reminders.yml              # (Phase 2) cron calling /api/internal/reminders
├── backend/
│   ├── requirements.txt           # Runtime dependencies
│   ├── requirements-dev.txt       # pytest, ruff, freezegun, pytest-cov
│   ├── pyproject.toml             # ruff + pytest config
│   ├── wsgi.py                    # gunicorn entrypoint: app = create_app()
│   ├── migrations/                # Alembic migrations (Flask-Migrate)
│   ├── app/
│   │   ├── __init__.py            # create_app(): config, extensions, blueprints, security hooks, SPA fallback
│   │   ├── config.py              # Config classes read from env (Dev, Test, Prod)
│   │   ├── extensions.py          # db, migrate, login_manager, limiter instances
│   │   ├── errors.py              # ApiError class + JSON error handlers
│   │   ├── security.py            # Origin check, content-type check, security headers
│   │   ├── models/
│   │   │   ├── __init__.py        # Re-exports all models
│   │   │   ├── user.py            # User model
│   │   │   ├── couple.py          # Couple model
│   │   │   ├── habit.py           # Habit model
│   │   │   ├── checkin.py         # Checkin model
│   │   │   └── weekly_result.py   # WeeklyResult model
│   │   ├── schemas/
│   │   │   ├── auth.py            # Register/Login/UpdateMe pydantic models
│   │   │   ├── couple.py          # Create/Join/Update couple models
│   │   │   ├── habit.py           # Create/Update habit models
│   │   │   └── checkin.py         # Checkin body model
│   │   ├── services/
│   │   │   ├── scoring.py         # Pure: points(), level_for_xp(), xp progress
│   │   │   ├── streaks.py         # Pure: streak computation functions
│   │   │   ├── timeutil.py        # today_in_tz(), week_start(), week_end()
│   │   │   ├── couple_service.py  # create, join (row lock), update timezone
│   │   │   ├── habit_service.py   # CRUD with ownership/couple rules
│   │   │   ├── checkin_service.py # create/undo check-in, streak cache update
│   │   │   ├── dashboard_service.py # Builds /api/today payload
│   │   │   └── duel_service.py    # Weekly points, finalize past weeks, tally, history
│   │   └── routes/
│   │       ├── health.py          # /api/health
│   │       ├── auth.py            # /api/auth/*
│   │       ├── couple.py          # /api/couple*
│   │       ├── habits.py          # /api/habits*, check-ins
│   │       ├── dashboard.py       # /api/today
│   │       └── duel.py            # /api/duel/*
│   └── tests/
│       ├── conftest.py            # App factory, DB fixtures (rollback per test), user/couple factories
│       ├── unit/
│       │   ├── test_scoring.py    # Points, multiplier, level boundaries
│       │   ├── test_streaks.py    # Streak scenarios
│       │   └── test_timeutil.py   # Week boundaries and timezones
│       └── integration/
│           ├── test_auth.py
│           ├── test_couple.py
│           ├── test_habits.py
│           ├── test_checkins.py
│           ├── test_today.py
│           ├── test_duel.py
│           └── test_security.py   # Authorization, origin, rate limit
└── frontend/
    ├── package.json               # Scripts: dev, build, test, lint
    ├── tsconfig.json              # Strict TypeScript
    ├── vite.config.ts             # Dev proxy /api -> localhost:5000; PWA plugin
    ├── tailwind.config.js         # Theme tokens
    ├── index.html                 # Root HTML, viewport meta
    ├── public/
    │   ├── manifest.webmanifest   # PWA manifest
    │   └── icons/                 # 192 and 512 px app icons (own artwork)
    └── src/
        ├── main.tsx               # React root, QueryClientProvider, Router
        ├── App.tsx                # Route table and guards
        ├── api/
        │   ├── client.ts          # fetch wrapper: JSON, error mapping, 401 handling
        │   ├── types.ts           # TypeScript types matching API objects
        │   └── hooks.ts           # TanStack Query hooks per endpoint
        ├── components/
        │   ├── AppShell.tsx       # Layout with bottom tab bar
        │   ├── XpBar.tsx          # Level and XP progress bar
        │   ├── HabitRow.tsx       # Habit row with check button, streak, points
        │   ├── ScoreCard.tsx      # Duel score card
        │   ├── Toast.tsx          # Toast notifications
        │   ├── Skeleton.tsx       # Loading placeholders
        │   ├── ErrorState.tsx     # Error + retry
        │   └── Confetti.tsx       # Level-up effect
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── PairPage.tsx
        │   ├── TodayPage.tsx
        │   ├── HabitsPage.tsx
        │   ├── HabitFormPage.tsx
        │   ├── DuelPage.tsx
        │   └── SettingsPage.tsx
        ├── lib/
        │   ├── dates.ts           # Weekday labels, date helpers
        │   └── validation.ts      # zod schemas for forms
        └── tests/                 # Vitest + Testing Library component and page tests
```

Phase 2 adds: `models/{badge,user_badge,xp_event,nudge,coin_ledger,reward,reward_purchase,team_goal,push_subscription}.py`, `services/{badge_service,nudge_service,coin_service,reward_service,team_goal_service,push_service,feed_service,stats_service}.py`, `routes/{badges,nudges,coins,rewards,team_goal,push,feed,stats,internal}.py`, matching tests, frontend pages `BadgesPage`, `ShopPage`, `FeedPage`, `StatsPage`, and `frontend/src/sw.ts` (service worker for push).

## 11. Implementation Roadmap

Rules for every step: write tests in the same step, run `ruff check`, `pytest` (and frontend `npm test`, `npm run lint` once the frontend exists), update `CHANGELOG.md`, leave the app runnable.

**Step 1: Backend scaffold**
- Goal: runnable Flask app with tooling.
- Create: `backend/requirements*.txt`, `pyproject.toml`, `wsgi.py`, `app/__init__.py`, `config.py`, `extensions.py`, `errors.py`, `routes/health.py`, `tests/conftest.py`, `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`.
- Implement: app factory, config from env, JSON error handler producing the section 7 error format, `GET /api/health`, Postgres docker-compose, CI running ruff and pytest.
- Done when: `flask run` serves `/api/health` returning `{"status":"ok"}`; `pytest` passes the health test; unknown routes under `/api` return the JSON 404 format.

**Step 2: Models and migrations (users, couples)**
- Create/modify: `models/user.py`, `models/couple.py`, `models/__init__.py`, migrations.
- Implement: tables per section 6 (users, couples) with constraints and indexes; `flask db migrate` and `upgrade`.
- Done when: `flask db upgrade` creates both tables on a clean DB; a test inserts a user and couple and violates unique(email) with an `IntegrityError`.

**Step 3: Auth (F1)**
- Create/modify: `schemas/auth.py`, `routes/auth.py`, `security.py`, `extensions.py` (login manager, limiter), `app/__init__.py`.
- Implement: register (allowlist, lowercase email, argon2), login, logout, GET and PATCH `/api/auth/me`, session cookie settings, Origin/Content-Type hooks, security headers, rate limits.
- Done when: all F1 acceptance criteria pass as integration tests; `test_security.py` covers bad Origin (403) and the 11th login in a minute (429).

**Step 4: Couple pairing (F2)**
- Create: `services/couple_service.py`, `schemas/couple.py`, `routes/couple.py`; add `services/timeutil.py` timezone validation.
- Implement: create, join with `FOR UPDATE`, get, patch timezone; invite code generator from the section 6 alphabet; `invite_code` hidden at 2 members.
- Done when: F2 criteria pass, including a two-thread concurrent join test where exactly one succeeds.

**Step 5: Habits (F3)**
- Create: `models/habit.py`, migration, `schemas/habit.py`, `services/habit_service.py`, `routes/habits.py`.
- Implement: habits table with partial unique index and checks; list (`owner=me|partner`), create, patch, archive with the authorization rules.
- Done when: F3 criteria pass; the partner cannot PATCH or DELETE your habit (403); a user from another couple gets 404.

**Step 6: Scoring, streaks and check-ins (F4, F5, F6)**
- Create: `services/scoring.py`, `services/streaks.py`, `services/checkin_service.py`, `models/checkin.py`, migration, `schemas/checkin.py`; add routes to `routes/habits.py`.
- Implement: pure functions exactly per section 2; check-in create (date window, scheduled check, unique) and undo; recompute and store `current_streak` and `best_streak` on the habit after each change; return `total_xp` and `level`.
- Done when: unit tests cover the multiplier ladder (1.0 to 1.5), the level boundaries (0, 99, 100, 399, 400), and the streak scenarios in F5; integration tests cover every F4 criterion.

**Step 7: Today endpoint (F8, F6 display)**
- Create: `services/dashboard_service.py`, `routes/dashboard.py`.
- Implement: `GET /api/today` per section 7 including `points_if_done`, `xp_into_level`, `xp_for_next_level`, and `partner: null`.
- Done when: `test_today.py` passes for a solo couple, a full couple, a habit not scheduled today (absent), and an archived habit (absent).

**Step 8: Weekly duel (F7)**
- Create: `models/weekly_result.py`, migration, `services/duel_service.py`, `routes/duel.py`; extend `timeutil.py` with `week_start/week_end`.
- Implement: live weekly points, lazy finalize of past weeks since `couples.created_at` using `ON CONFLICT DO NOTHING`, tally, history; with freezegun tests for week boundaries and the timezone edge (23:30 on Sunday Casablanca).
- Done when: F7 criteria pass; calling `/duel/current` twice does not duplicate rows; tie and zero-zero weeks have `winner_user_id = NULL`.

**Step 9: Frontend scaffold and auth screens (F1 UI)**
- Create: the `frontend/` skeleton (vite, tailwind, router, query client), `api/client.ts`, `api/types.ts`, `api/hooks.ts` (auth hooks), `LoginPage`, `RegisterPage`, `Toast`, route guards in `App.tsx`; update `ci.yml` for frontend.
- Implement: forms with zod validation, error mapping from API error codes, 401 redirects to `/login`; Vite dev proxy to Flask.
- Done when: you can register and log in against the local backend in a browser; Vitest tests cover the login form states (loading, invalid credentials, rate-limited).

**Step 10: App shell and pairing UI (F2 UI)**
- Create: `AppShell.tsx`, `PairPage.tsx`, couple hooks.
- Implement: bottom tab bar, guard redirecting users without a couple to `/pair`, create/join flows, invite code display with copy and 5 s polling.
- Done when: two browser profiles can pair via code and both land on `/`; error states for bad and full codes render; component tests pass.

**Step 11: Habits UI (F3 UI)**
- Create: `HabitsPage.tsx`, `HabitFormPage.tsx`, `lib/validation.ts`, habit hooks.
- Implement: list (Mine/Partner's), create/edit form, archive with confirm, field-level server errors.
- Done when: creating, editing and archiving a habit works in the browser; the partner's list is read-only; tests cover form validation and the archive confirm.

**Step 12: Today UI (F4, F5, F6, F8 UI)**
- Create: `TodayPage.tsx`, `HabitRow.tsx`, `XpBar.tsx`, `Confetti.tsx`, check-in hooks.
- Implement: optimistic toggle with rollback, "+N XP" animation, streak flame, Yesterday tab, partner section, polling every 15 s, level-up confetti when `level` increases.
- Done when: checking a habit updates XP and streak immediately and persists after reload; the second browser profile sees it within 15 s; tests cover optimistic rollback on a 409 or 500.

**Step 13: Duel UI (F7 UI)**
- Create: `DuelPage.tsx`, `ScoreCard.tsx`, duel hooks.
- Implement: score cards, tug-of-war bar (50/50 at 0-0), days left, tally, history list with empty state.
- Done when: the screen matches the API for a seeded scenario; tests cover the leader, tie and no-partner states.

**Step 14: Settings and polish (F9)**
- Create: `SettingsPage.tsx`, `Skeleton.tsx`, `ErrorState.tsx`.
- Implement: name edit, timezone change, invite code visibility, logout; skeleton/empty/error states on every screen; PWA manifest, icons and `vite-plugin-pwa` basic offline shell.
- Done when: the app is installable on a phone ("Add to Home Screen"), all screens show proper loading/empty/error states, and F9 criteria pass.

**Step 15: Packaging and deployment (MVP complete)**
- Create: `Dockerfile`, SPA fallback in `app/__init__.py` (serve `frontend/dist/index.html` for non-`/api` GETs), `README.md` deploy section.
- Implement: multi-stage Docker build, gunicorn config (`--workers 2 --bind 0.0.0.0:$PORT`), `flask db upgrade` on release, deploy to Render with Neon `DATABASE_URL`, set `ALLOWED_EMAILS`.
- Done when: the production URL serves the app over HTTPS, you and your girlfriend can register (and a third email cannot), pair, check in and see the duel; manual test checklist in section 12 passes.

**Phase 2 steps** (start only after the MVP has been used for one week and the owner approves):
- **Step 16, Badges and perfect-day bonus (F10, F11):** `badges`, `user_badges`, `xp_events` tables and seed; `badge_service`; hook into check-in/undo transaction; `/api/badges`; update `total_xp` and `/api/today`; Badges page. Done when: each badge criterion has a passing test and perfect-day add/remove on undo works.
- **Step 17, Nudges and cheers (F12):** `nudges` table, service, routes, UI banner and buttons. Done when: daily limit (429) and read-state tests pass.
- **Step 18, Coins and reward shop (F13):** `coin_ledger`, `rewards`, `reward_purchases` tables; `coin_service` (earn hooks in check-in/undo, duel finalize, badge award; backfill migration); reward/purchase routes; Shop page and coin balance in the header. Done when: ledger idempotency, no-overdraw under concurrent buys, creator-only fulfill and undo-removes-coins tests pass.
- **Step 18b, Weekly team goals (F22):** `team_goals` table, `team_goal_service` (live progress, Wednesday lock, auto-assign, finalize with coin award), routes, team goal card on Duel page. Done when: both goal types match fixture data, `goal_locked` after Wednesday, and +50 coins is awarded once per partner.
- **Step 19, Activity feed (F15):** `feed_service` derived from existing tables, route, Feed page. Done when: ordering and 50-limit tests pass.
- **Step 20, Stats and charts (F16):** `stats_service`, route, Recharts page. Done when: aggregates match SQL in tests and empty states render.
- **Step 21, Web push and reminders (F14):** `push_subscriptions` table, VAPID setup, `sw.ts`, subscription routes, `/api/internal/reminders`, `reminders.yml` cron. Done when: a test subscription receives a push locally, 404/410 endpoints are pruned, and the cron secret is enforced.

## 12. Testing Plan

Test runner: `pytest` (backend, real Postgres, each test in a rolled-back transaction, `freezegun` for time) and `vitest` (frontend). Coverage target: 85% on `app/services` and `app/routes`.

### Unit tests
| ID | Case | Feature |
|---|---|---|
| U1 | `points(difficulty, streak)` for d=1..3, streak=1..8 matches the ladder (e.g. d=1: 10,11,12,13,14,15,15,15; d=3: 30,33,36,39,42,45,45,45) | F4 |
| U2 | `level_for_xp`: 0 to 1, 99 to 1, 100 to 2, 399 to 2, 400 to 3, 900 to 4 | F6 |
| U3 | Streak: daily habit done 3 days gives 3; gap resets; today pending does not reset | F5 |
| U4 | Streak: Mon/Wed/Fri schedule done on all three gives 3; off days ignored | F5 |
| U5 | `week_start` for Sunday 23:30 Casablanca and Monday 00:00; `today_in_tz` across timezones | F7 |
| U6 | Email lowercase normalization; schemas reject extra fields and out-of-range values | F1, F3 |

### Integration tests (API)
| ID | Case | Feature |
|---|---|---|
| I1 | Register success, duplicate email, allowlist rejection, weak password | F1 |
| I2 | Login success, wrong password and unknown email give identical errors; logout invalidates session; 11th request returns 429 | F1 |
| I3 | Create couple, join, full couple, bad code, already in couple, concurrent join | F2 |
| I4 | Timezone change valid and invalid | F2, F9 |
| I5 | Habit CRUD, name uniqueness (case-insensitive, active only), validation errors | F3 |
| I6 | Partner cannot edit/archive/check-in your habit (403); other-couple user gets 404 | F3, F4, security |
| I7 | Check-in success with points, today and yesterday allowed, older date 422, unscheduled 422, duplicate 409, archived habit 409 | F4 |
| I8 | Undo removes points and recomputes streak; undo missing returns 404 | F4, F5, F6 |
| I9 | `/api/today` shape: solo couple (`partner` null), full couple, scheduled filter, `points_if_done` correct | F8, F6 |
| I10 | Duel: live points, leader, finalize idempotency, tie, history order, tally, Sunday-night timezone edge | F7 |
| I11 | Origin mismatch gives 403; non-JSON body gives 415; security headers present | Security |
| I12 | `PATCH /api/auth/me` updates name and validates length | F9 |

### Frontend tests
| ID | Case | Feature |
|---|---|---|
| FE1 | Login and register forms: validation, loading, API error display | F1 |
| FE2 | Route guards: no session to `/login`; no couple to `/pair` | F1, F2 |
| FE3 | Pair page: create shows code, join error states | F2 |
| FE4 | Habit form validation (at least one weekday, name length) and archive confirm | F3 |
| FE5 | Today: optimistic check, rollback on error, XP bar updates, partner read-only | F4, F6, F8 |
| FE6 | Duel page states: leader, tie, no partner, empty history | F7 |

### Manual checklist (run on deployed app with two real phones)
1. Register both accounts; a third email is rejected. (F1)
2. Create couple on phone A, join on phone B with the code; code disappears afterwards. (F2, F9)
3. Create 3 habits with different difficulties and weekdays on each phone. (F3)
4. Check in: points and streak flame correct; partner phone shows it within 15 s. (F4, F5, F8)
5. Undo a check-in; XP decreases. (F4, F6)
6. Push XP past 100: level 2 and confetti appear. (F6)
7. Check Duel screen leader and tug-of-war; wait through a Sunday-to-Monday rollover and verify history. (F7)
8. Install to home screen on both phones. (A1)

### Traceability
| Feature | Roadmap steps | Tests |
|---|---|---|
| F1 | 3, 9 | I1, I2, U6, FE1, FE2 |
| F2 | 4, 10 | I3, I4, FE2, FE3 |
| F3 | 5, 11 | I5, I6, U6, FE4 |
| F4 | 6, 12 | U1, I6, I7, I8, FE5 |
| F5 | 6, 12 | U3, U4, I8 |
| F6 | 6, 7, 12 | U2, I8, I9, FE5 |
| F7 | 8, 13 | U5, I10, FE6 |
| F8 | 7, 12 | I9, FE5 |
| F9 | 14 | I4, I12, manual 2 |
| F10, F11 | 16 | Written in Step 16 (badge criteria, perfect-day add/remove) |
| F12 | 17 | Written in Step 17 |
| F13 | 18 | Written in Step 18 |
| F22 | 18b | Written in Step 18b |
| F15 | 19 | Written in Step 19 |
| F16 | 20 | Written in Step 20 |
| F14 | 21 | Written in Step 21 |

## 13. Deployment & Config

### Environment variables
| Variable | Required | Example / Notes |
|---|---|---|
| `FLASK_ENV` | yes | `development` or `production` |
| `SECRET_KEY` | yes (min 32 chars) | Generate: `python -c "import secrets;print(secrets.token_hex(32))"` |
| `DATABASE_URL` | yes | `postgresql+psycopg://user:pass@host:5432/duohabits` |
| `ALLOWED_EMAILS` | recommended | `you@example.com,her@example.com` (empty means open registration) |
| `ALLOWED_ORIGINS` | yes in prod | `https://duohabits.onrender.com` |
| `DEFAULT_TIMEZONE` | no | `Africa/Casablanca` |
| `CRON_SECRET` | Phase 2 | Random 32+ chars |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phase 2 | Generated once with `py_vapid`; subject `mailto:you@example.com` |

### Local setup
```bash
# 1. Database
docker compose up -d db

# 2. Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp ../.env.example ../.env        # then edit values
export FLASK_APP=wsgi.py
flask db upgrade
flask run --port 5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173, proxies /api to :5000

# Tests and lint
cd backend && ruff check . && pytest
cd frontend && npm run lint && npm test
```

### Deploy (Render + Neon, free tiers)
1. Create a Neon Postgres project; copy the connection string into `DATABASE_URL` (use the `postgresql+psycopg://` scheme, `sslmode=require`).
2. Push the repo to GitHub. In Render create a **Web Service** from the repo using the Dockerfile.
3. Set all required environment variables; set start command `gunicorn wsgi:app --workers 2 --bind 0.0.0.0:$PORT`.
4. Set "pre-deploy command" to `flask db upgrade`.
5. Open the URL, register the two allowed accounts, then verify the manual checklist.
6. Note: the free Render service sleeps after inactivity (first request is slow); accept this or ping `/api/health` from the Phase 2 cron workflow.
7. Neon free tier: back up with `pg_dump` monthly (runbook in README).

## 14. Risks & Open Questions

**Risks**
- Render free instance cold starts (about 30-60 s) can make the first open of the day feel broken. Mitigation: skeleton screens and the cron ping.
- Free-tier limits or policy changes at Render/Neon. Mitigation: Docker image is portable; `DATABASE_URL` is the only coupling.
- Fixed-at-creation points (A15) mean undoing an old check-in leaves later multipliers unchanged. This is accepted for simplicity.
- Timezone mistakes around week boundaries are the likeliest scoring bug; dedicated freezegun tests (U5, I10) cover them.
- Web push on iOS requires the PWA to be installed to the home screen (iOS 16.4+); reliability varies. Phase 2 only.
- Competitive pressure can feel bad on missed weeks. The team goals and shared coins are there to balance it; keep reward ideas playful.
- Scope: coins, shop and team goals add 3 tables and about 12 endpoints on top of the MVP. They stay in Phase 2 so the duel and streaks can be tested with real use first.
- Honor-system cheating (checking in without doing the habit) is not preventable by design.

**Open questions for the owner**
1. Confirm the platform (PWA web app) and the free-tier hosting choice.
2. Is the scoring formula (10/20/30 base, up to +50% streak bonus) the feel you want, or should difficulty be assigned by the partner?
3. Phase 2 order is now badges, coins and shop, team goals, nudges, push, feed, stats. Confirm or reorder.
4. Coin amounts (check-in = difficulty, duel win 25, team goal 50 each) are placeholders; do they feel right relative to reward prices you would set?
5. Still open from earlier: streak freezes for sick days or travel, and a fairness handicap if your habits differ in difficulty (A25, A26).
6. Do you want shared co-op habits (F17) earlier than "Later", given team goals already cover cooperation?

## 15. Agent Instructions

Paste the block below to the coding AI.

```
You are the implementation agent for the app "DuoHabits". The full specification is in PLAN.md (included below or attached). It is the single source of truth. Follow it exactly.

RULES
1. Build ONE roadmap step at a time, in numeric order (section 11). Never skip ahead or start the next step in the same session unless I say so.
2. Before starting a step, restate its goal and list the files you will create or modify. Then implement exactly what the step lists, no more.
3. If anything in the plan is ambiguous, contradictory, or you believe a deviation is needed (different library, endpoint shape, schema change), STOP and ask me before changing it. Do not silently deviate.
4. Write tests in the same step, tied to the acceptance criteria and test IDs in section 12. A step is not done until its "Done when" check passes.
5. Run `ruff check`, `pytest` (and `npm run lint`, `npm test` once the frontend exists) before declaring a step done. Fix failures; never delete or weaken a test to make it pass.
6. The app must be runnable and consistent at the end of every step (migrations applied, no broken imports, no half-built endpoints).
7. Keep business logic in services/, never in routes. Scoring, streak and week logic must follow section 2 exactly.
8. Use only the libraries in section 5. Use ORM/bound parameters only (no string-built SQL). Never commit secrets; use environment variables and keep .env.example current.
9. Maintain CHANGELOG.md: after each step append an entry with step number, date, summary, files touched, tests added, and any deviations I approved.
10. Do not build Phase 2 or Later features until I explicitly approve starting Phase 2.
11. At the end of each step reply with: what was done, test results, how to verify manually, and "Ready for Step N+1?".

BEGIN NOW with Step 1 (Backend scaffold). Do not start Step 2 until I confirm.
```
