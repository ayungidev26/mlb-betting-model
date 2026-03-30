# MLB Betting Model

A password-protected MLB prediction and betting-edge application built on **Next.js (Pages Router) serverless API routes**, **Upstash Redis**, and scheduled automation via **GitHub Actions** (plus optional cron entry routes).

This repository contains:

- A protected dashboard (`/`) that shows cached predictions and model-vs-market edges.
- A protected stats explorer (`/stats`) that shows cached pitcher, bullpen, and offense model inputs.
- Serverless API routes that ingest MLB schedules, odds, and stats; run the model; and publish cache-backed outputs.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [How the System Works (Data Flow)](#how-the-system-works-data-flow)
- [Repository Structure](#repository-structure)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Deployment (Vercel)](#deployment-vercel)
- [Automation & Scheduling](#automation--scheduling)
- [API Reference](#api-reference)
- [Redis Keys](#redis-keys)
- [Manual Verification](#manual-verification)
- [Scripts](#scripts)
- [Security Notes](#security-notes)
- [Data Contracts](#data-contracts)
- [Disclaimer](#disclaimer)

---

## Project Overview

This system generates same-day MLB moneyline recommendations by comparing model win probabilities to market implied probabilities.

There are two main operational workflows:

1. **Stats pipeline** (morning ET, once per Eastern day unless forced)
   - Refreshes today’s game slate and ballpark factors.
   - Fetches/caches pitcher, bullpen, and offense inputs.
2. **Market pipeline** (in-day refreshes)
   - Refreshes odds for upcoming games.
   - Runs model predictions from cached games/stats/ratings.
   - Finds model-vs-market edges above threshold.

There is also a **historical workflow** used to build team Elo ratings and evaluate stored predictions.

---

## Architecture

### Runtime and Infrastructure

- **Framework/runtime:** Next.js (Pages Router) serverless functions on Node.js.
- **Hosting target:** Vercel.
- **Data store/cache:** Upstash Redis via REST API.
- **Automation:** GitHub Actions workflow (`.github/workflows/schedule-pipeline.yml`) plus optional cron entry routes under `/api/cron/*`.

### External Data Sources

- **MLB Stats API**: schedule, probable pitchers, team/player stats, historical finals.
- **Baseball Savant CSV feeds**: advanced pitcher/offense/bullpen context.
- **The Odds API**: moneyline markets (`h2h`, US region).

### Access and Auth Model

The app uses two authentication layers:

1. **UI session auth (cookie-based)**
   - Middleware protects most pages/routes.
   - `/login` posts to `/api/login` with `APP_PASSWORD`.
   - Server sets HTTP-only `app_session` cookie with a **5-minute TTL**.

2. **Operational API auth (token-based)**
   - Operational routes require `POST` and a valid admin token.
   - Accepted auth forms:
     - `Authorization: Bearer <token>`
     - `x-admin-secret: <token>`
     - JSON body fields `adminSecret` / `authToken`
   - Token resolution preference:
     1. `ADMIN_API_SECRET`
     2. fallback `CRON_SECRET` (if admin secret is not set)

### Middleware/API Visibility Notes

- Middleware explicitly allows unauthenticated access to:
  - `/login`, `/api/login`, `/api/logout`
  - `/api/runStatsPipeline`, `/api/runPipeline`
  - `/api/cron/*`
- Other routes (including GET APIs like `/api/predictions`, `/api/edges`, `/api/odds`, `/api/stats`, `/api/evaluation`) are still GET-only/no-admin-token at handler level, but are typically reached through authenticated app usage.

### Guardrails and Reliability

Operational ingestion/orchestration routes enforce:

- IP-based rate limiting (`mlb:limit:*`)
- Redis-backed job locks (`mlb:lock:*`)
- Cooldowns on expensive routes (`mlb:cooldown:*`, e.g. odds refresh and historical loads)
- ET-date idempotency markers for daily workflows (`mlb:cron:*`)

---

## How the System Works (Data Flow)

### 0) Historical bootstrap (required before first model run)

`POST /api/loadHistorical` then `POST /api/buildRatings`

- Loads final MLB games by season range.
- Builds Elo ratings and stores team baseline ratings.
- Required because `runModel` expects `mlb:ratings:teams`.

### 1) Schedule ingestion

`POST /api/fetchGames`

- Fetches today’s MLB schedule and probable pitchers.
- Builds canonical `matchKey` (`YYYY-MM-DD|awayTeam|homeTeam`).
- Resolves/attaches ballpark factors.
- Writes:
  - `mlb:games:today`
  - `mlb:games:today:meta`
  - `mlb:ballparkFactors:current`

### 2) Odds ingestion

`POST /api/fetchOdds`

- Fetches US h2h moneylines from The Odds API.
- Normalizes to canonical odds records.
- Default mode is cache-first (avoids unnecessary upstream calls).
- `?refresh=true` performs selective refresh:
  - preserves already-started games from cache,
  - refreshes upcoming games from latest payload,
  - drops invalid/undated records.
- Writes:
  - `mlb:odds:today`

### 3) Pitcher stats ingestion

`POST /api/fetchPitcherStats`

- Aggregates pitcher season stats.
- Merges advanced Savant metrics and pitcher metadata.
- Writes:
  - `mlb:stats:pitchers`
  - `mlb:stats:pitchers:meta`

### 4) Bullpen stats ingestion

`POST /api/fetchBullpenStats`

- Builds bullpen quality and fatigue/workload context.
- Writes:
  - `mlb:stats:bullpen`
  - `mlb:stats:bullpen:meta`

### 5) Team offense stats ingestion

`POST /api/fetchTeamOffenseStats`

- Builds team offense baselines, splits/form, and quality-of-contact signals.
- Writes:
  - `mlb:stats:offense`
  - `mlb:stats:offense:meta`

### 6) Prediction generation

`POST /api/runModel`

- Uses cached games + ratings + stats to compute per-game win probabilities.
- Model combines:
  - Team Elo baseline
  - Starting pitcher component
  - Bullpen component
  - Offense component
  - Ballpark/environment adjustments
  - Home-field adjustment
- Writes:
  - `mlb:predictions:today`
  - `mlb:predictions:<UTC-YYYY-MM-DD>`

> Note: if ratings/stats caches are missing, this step fails and indicates prerequisites.

### 7) Edge detection

`POST /api/findEdges`

- Joins predictions and odds by `matchKey`.
- Converts moneylines to implied probabilities.
- Emits edges where `edge > 0.03` (3%).
- Writes:
  - `mlb:edges:today`

### 8) Stats orchestration

`POST /api/runStatsPipeline`

Runs, in order:

```text
fetchGames -> fetchPitcherStats -> fetchBullpenStats -> fetchTeamOffenseStats
```

- Uses ET-date idempotency marker:
  - `mlb:cron:statsPipeline:YYYY-MM-DD`
- Skips duplicate runs on same ET date unless `?force=true`.

### 9) Market orchestration

`POST /api/runPipeline`

Runs, in order:

```text
fetchOdds?refresh=true -> runModel -> findEdges
```

- Requires current games cache from stats pipeline.
- Returns `409` with explicit codes if games cache is missing/stale:
  - `GAMES_CACHE_MISSING`
  - `GAMES_CACHE_STALE`

### 10) Daily cron orchestration route

`GET|POST /api/cron/runDailyPipeline`

- Requires `CRON_SECRET` bearer auth.
- By default runs only at **10:00 ET exact minute** (`?force=true` bypasses this gate).
- Uses ET-date idempotency marker:
  - `mlb:cron:dailyPipeline:YYYY-MM-DD`
- Internally runs `runStatsPipeline` before `runPipeline`.

### 11) Evaluation workflow

1. `POST /api/evaluatePredictions`
   - Compares `mlb:predictions:<date>` to historical finals.
   - Stores summaries in `mlb:evaluation:<date>` by default (`persist` defaults to `true`).
2. `GET /api/evaluation`
   - Reads persisted summaries over date ranges (`limit` max `180`).

---

## Repository Structure

```text
pages/
  index.js                           # protected dashboard UI
  stats.js                           # protected cached-stats explorer
  login.js                           # password login UI
  api/
    predictions.js                   # cached predictions (GET handler)
    edges.js                         # cached edges (GET handler)
    odds.js                          # cached odds (GET handler)
    stats.js                         # cached stats sections (GET handler)
    evaluation.js                    # cached evaluation summaries (GET handler)

    login.js                         # create UI session cookie
    logout.js                        # clear UI session cookie

    fetchGames.js                    # ingest today's schedule + ballpark factors
    fetchOdds.js                     # ingest/refresh today's odds
    fetchPitcherStats.js             # ingest pitcher stats
    fetchBullpenStats.js             # ingest bullpen stats
    fetchTeamOffenseStats.js         # ingest offense stats
    runModel.js                      # generate predictions
    findEdges.js                     # generate edges

    runStatsPipeline.js              # stats pipeline orchestrator
    runPipeline.js                   # market pipeline orchestrator

    loadHistorical.js                # load historical finals by season
    buildRatings.js                  # build Elo team ratings from historical data
    evaluatePredictions.js           # prediction-vs-results evaluator

    cron/
      runDailyStatsPipeline.js       # cron entry for stats workflow
      runDailyPipeline.js            # cron entry for stats+market workflow

lib/
  apiSecurity.js                     # auth/method guards for API routes
  apiGuards.js                       # rate-limit, lock, cooldown helpers
  pipeline.js                        # prediction/edge orchestration helpers
  cronSchedule.js                    # ET date/window helpers
  normalizeOdds.js                   # canonical odds normalization
  ballparkFactors.js                 # park-factor resolution and fallback
  homePageProps.js                   # dashboard view-model assembly
  ...

model/
  predictor.js                       # core game prediction composition
  eloRatings.js                      # Elo training from historical finals
  pitcherRatings.js
  bullpenRatings.js
  offenseRatings.js

data/
  ballparkFactors.js                 # bundled fallback park-factor dataset

docs/
  data-contracts.md                  # canonical payload contracts

scripts/
  run-daily-scheduler.mjs            # local cron-route trigger helper
  capture-dashboard-shot.mjs         # optional dashboard screenshot helper
  verify-audit.mjs                   # repository audit checks

.github/workflows/
  schedule-pipeline.yml              # scheduled stats + market refresh
```

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes | API + SSR/UI data loads | Upstash REST endpoint URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | API + SSR/UI data loads | Upstash REST auth token |
| `ODDS_API_KEY` | Yes (for odds ingestion) | `/api/fetchOdds` | The Odds API key |
| `ADMIN_API_SECRET` | Yes (recommended) | Operational `POST` routes | Main admin/ops auth token |
| `CRON_SECRET` | Required for `/api/cron/*` | Cron entry routes + scheduler helper | Separate secret for cron triggers |
| `APP_PASSWORD` | Yes (for protected UI) | `/api/login`, middleware session validation | Shared app password |
| `SCHEDULER_BASE_URL` | Optional | `npm run test:scheduler` | Defaults to `http://localhost:3000` |
| `BALLPARK_FACTORS_URL` | Optional | Ballpark factor resolver | Remote JSON/CSV source; falls back to bundled `data/ballparkFactors.js` |

### Auth fallback behavior

Operational route secret resolution is:

1. `ADMIN_API_SECRET` (preferred)
2. fallback to `CRON_SECRET` if admin secret is absent

Fallback works, but production should keep admin and cron secrets distinct.

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- npm
- Upstash Redis database
- The Odds API key

### Install

```bash
npm install
```

### Configure env

```bash
cp .env.example .env.local
```

Set all required values in `.env.local`.

### Run app

```bash
npm run dev
```

Open `http://localhost:3000`, then sign in at `/login` with `APP_PASSWORD`.

### First-time data bootstrap (required)

`runModel` depends on team ratings in Redis (`mlb:ratings:teams`).

Run this once (and repeat when you want to retrain ratings window):

```bash
# 1) Load historical finals
curl -X POST "http://localhost:3000/api/loadHistorical?startSeason=2019&endSeason=2025" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"

# 2) Build team Elo ratings from loaded historical data
curl -X POST "http://localhost:3000/api/buildRatings?startSeason=2019&endSeason=2025" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Daily run sequence (manual)

```bash
# Refresh today's game/stats inputs
curl -X POST "http://localhost:3000/api/runStatsPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"

# Refresh odds + predictions + edges
curl -X POST "http://localhost:3000/api/runPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

---

## Deployment (Vercel)

1. Import this repository into Vercel.
2. Add env vars in **Project Settings → Environment Variables**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ODDS_API_KEY`
   - `ADMIN_API_SECRET`
   - `APP_PASSWORD`
   - optional: `CRON_SECRET`, `BALLPARK_FACTORS_URL`
3. Deploy.
4. Configure GitHub Actions secrets (below) if using scheduled automation.
5. Run bootstrap once in production:
   - `POST /api/loadHistorical`
   - `POST /api/buildRatings`
6. Trigger and verify one stats run and one market run.

---

## Automation & Scheduling

### Recommended production scheduler: GitHub Actions

Workflow file: `.github/workflows/schedule-pipeline.yml`.

#### Stats workflow behavior

- Cron schedule covers ET morning range.
- Job gates execution to **5:30 AM – 8:30 AM America/New_York**.
- Trigger path priority:
  1. `POST /api/cron/runDailyStatsPipeline` when `CRON_SECRET` is configured.
  2. fallback `POST /api/runStatsPipeline` using admin auth.

#### Market workflow behavior

- Cron schedule covers three ET windows.
- Job gates execution to:
  - 10:19 AM – 11:49 AM ET
  - 2:19 PM – 3:49 PM ET
  - 5:19 PM – 6:49 PM ET
- Trigger order:
  1. Run stats dependency first (`/api/cron/runDailyStatsPipeline?force=true` when `CRON_SECRET` exists, else `/api/runStatsPipeline`).
  2. Run market pipeline (`POST /api/runPipeline`) only after stats succeeds.
  3. If market returns `409`, workflow logs explicit dependency guidance and fails clearly.

> Note: `/api/cron/runDailyPipeline` has its own strict 10:00 ET minute-match gate unless `?force=true`.

### Required GitHub Actions secrets

- `PIPELINE_BASE_URL` (for example `https://your-app.vercel.app`)
- `ADMIN_API_SECRET`
- `CRON_SECRET` (needed to use cron endpoints)
- `PIPELINE_AUTH_TOKEN` (optional override; defaults to `ADMIN_API_SECRET` in workflow logic)

### Optional direct cron usage

You can call `/api/cron/runDailyStatsPipeline` and/or `/api/cron/runDailyPipeline` from Vercel Cron or another scheduler. Send `Authorization: Bearer <CRON_SECRET>`.

---

## API Reference

### UI auth/session routes

#### `POST /api/login`
Body:

```json
{ "password": "..." }
```

Validates `APP_PASSWORD` and sets HTTP-only session cookie.

#### `POST /api/logout`
Clears the session cookie.

### Read routes (GET handlers)

#### `GET /api/predictions`
Returns cached predictions and summary metadata.

#### `GET /api/edges`
Returns cached edges and summary metadata.

#### `GET /api/odds`
Returns cached normalized odds records and summary metadata.

#### `GET /api/stats`
Returns cached stats sections (`pitchers`, `bullpen`, `offense`) with section metadata.

#### `GET /api/evaluation`
Returns persisted evaluation summaries from `mlb:evaluation:<date>`.

Query params:

- `dateFrom` (optional, `YYYY-MM-DD`)
- `dateTo` (optional, `YYYY-MM-DD`)
- `limit` (optional, default `30`, max `180`)

### Operational/admin routes

All require:

- `POST`
- Operational secret (normally `Authorization: Bearer <ADMIN_API_SECRET>`)

Accepted auth forms:

- `Authorization: Bearer <token>`
- `x-admin-secret: <token>` header
- JSON body fallback (`adminSecret` or `authToken`)

Endpoints:

- `/api/fetchGames`
- `/api/fetchOdds`
- `/api/fetchPitcherStats`
- `/api/fetchBullpenStats`
- `/api/fetchTeamOffenseStats`
- `/api/runModel`
- `/api/findEdges`
- `/api/runStatsPipeline`
- `/api/runPipeline`
- `/api/loadHistorical`
- `/api/buildRatings`
- `/api/evaluatePredictions`

### Cron routes

#### `GET|POST /api/cron/runDailyStatsPipeline`

Requires:

- `Authorization: Bearer <CRON_SECRET>`

Behavior:

- Runs only during **5:30 AM – 8:30 AM ET** unless `?force=true`.
- Internally invokes `runStatsPipeline` using operational auth.

#### `GET|POST /api/cron/runDailyPipeline`

Requires:

- `Authorization: Bearer <CRON_SECRET>`

Behavior:

- Runs only at **10:00 ET exact minute** unless `?force=true`.
- Uses ET-date idempotency marker `mlb:cron:dailyPipeline:YYYY-MM-DD`.
- Orchestrates in order: `runStatsPipeline` then `runPipeline`.

---

## Redis Keys

### Core day-of-game keys

- `mlb:games:today`
- `mlb:games:today:meta`
- `mlb:odds:today`
- `mlb:predictions:today`
- `mlb:edges:today`

### Stats keys

- `mlb:stats:pitchers`
- `mlb:stats:pitchers:meta`
- `mlb:stats:bullpen`
- `mlb:stats:bullpen:meta`
- `mlb:stats:offense`
- `mlb:stats:offense:meta`

### Model baseline key

- `mlb:ratings:teams`

### Ballpark key

- `mlb:ballparkFactors:current`

### Historical/evaluation keys

- `mlb:games:historical:<season>`
- `mlb:games:historical:meta`
- `mlb:predictions:<date>`
- `mlb:evaluation:<date>`

### Orchestration guard keys

- `mlb:cron:statsPipeline:YYYY-MM-DD`
- `mlb:cron:dailyPipeline:YYYY-MM-DD`
- `mlb:lock:*`
- `mlb:limit:*`
- `mlb:cooldown:*`

---

## Manual Verification

### Run historical bootstrap

```bash
curl -X POST "http://localhost:3000/api/loadHistorical?startSeason=2022&endSeason=2025" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"

curl -X POST "http://localhost:3000/api/buildRatings?startSeason=2022&endSeason=2025" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Run stats pipeline

```bash
curl -X POST "http://localhost:3000/api/runStatsPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Run market pipeline

```bash
curl -X POST "http://localhost:3000/api/runPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Refresh odds selectively (preserve started games)

```bash
curl -X POST "http://localhost:3000/api/fetchOdds?refresh=true" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Evaluate predictions over date range

```bash
curl -X POST "http://localhost:3000/api/evaluatePredictions" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"2025-04-01","dateTo":"2025-04-07","persist":true}'
```

### Read persisted evaluation summaries

```bash
curl "http://localhost:3000/api/evaluation?dateFrom=2025-04-01&dateTo=2025-04-07&limit=30"
```

### Trigger cron helper locally

```bash
CRON_SECRET=your-secret SCHEDULER_BASE_URL=http://localhost:3000 npm run test:scheduler
```

---

## Scripts

- `npm run dev` — start local Next.js dev server.
- `npm run build` — build for production.
- `npm run start` — run production server.
- `npm test` — run Node test suite (`tests/*.test.mjs`).
- `npm test -- --run tests/cronRoute.test.mjs tests/statsCronRoute.test.mjs tests/cronSchedule.test.mjs` — run targeted tests.
- `npm run test:scheduler` — local cron-route trigger helper.
- `npm run screenshot:dashboard` — capture dashboard screenshot helper (when local app is running).

---

## Security Notes

- Never commit `.env.local` or real secrets.
- Rotate exposed credentials immediately.
- Keep `ADMIN_API_SECRET`, `CRON_SECRET`, and `APP_PASSWORD` distinct in production.
- Keep read routes GET-only and cache-backed.
- Keep operational routes POST-only and secret-protected.

---

## Data Contracts

Canonical payload schemas and naming rules are in:

- `docs/data-contracts.md`

If you change payload shape/field names in any pipeline stage, update that document and keep dependent stages aligned.

---

## Developer Note: Workflow YAML Validation

Quick local check for scheduler workflow syntax:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/schedule-pipeline.yml'); puts 'ok'"
```

---

## Disclaimer

This project is for educational and analytical use. Sports betting carries financial risk—use responsibly and comply with local laws.
