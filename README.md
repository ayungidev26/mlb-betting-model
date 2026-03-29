# MLB Betting Model

A password-protected MLB prediction and betting-edge application built on **Next.js serverless API routes**, **Upstash Redis**, and scheduled automation (GitHub Actions and optional cron endpoints).

This repository contains:

- A protected dashboard (`/`) that shows cached predictions and model-vs-market edges.
- A protected stats explorer (`/stats`) that shows cached pitcher/bullpen/offense inputs.
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

This system builds same-day MLB moneyline recommendations by comparing model probabilities against market implied probabilities.

There are two operational workflows:

1. **Stats pipeline** (morning ET, once per Eastern day unless forced)
   - Fetches and caches pitcher, bullpen, and offense inputs.
2. **Market pipeline** (in-day refreshes)
   - Fetches today’s games and odds.
   - Runs model predictions from cached stats.
   - Finds edges where model probability exceeds market implied probability.

The dashboard and stats pages are read-only views over Redis cache outputs.

---

## Architecture

### Runtime and Infrastructure

- **Framework/runtime:** Next.js (Pages Router) serverless functions on Node.js.
- **Hosting target:** Vercel.
- **Data store/cache:** Upstash Redis (REST API).
- **Automation:** GitHub Actions workflow (`.github/workflows/schedule-pipeline.yml`) plus optional cron entry routes under `/api/cron/*`.

### External Data Sources

- **MLB Stats API** for schedule and many team/player stats.
- **Baseball Savant** leaderboard CSV feeds for advanced metrics.
- **The Odds API** for moneyline markets.

### Access and Auth Model

The app has two independent authentication layers:

1. **UI session auth**
   - Middleware protects non-exempt routes.
   - `/login` posts to `/api/login` with `APP_PASSWORD`.
   - Server sets an HTTP-only cookie (`app_session`) with a **5-minute TTL**.

2. **API route auth**
   - Public cache routes are GET-only and do not require admin auth.
   - Operational routes require `POST` + admin bearer token (or accepted fallback secret headers/body fields).
   - Cron routes require `CRON_SECRET` and allow `GET`/`POST`.

### Guardrails and Reliability

Operational ingestion/orchestration routes enforce:

- IP-based rate limiting.
- Redis-backed job locks (prevent overlapping runs).
- Cooldowns on expensive routes (for example odds refresh and historical loads).

---

## How the System Works (Data Flow)

### 1) Schedule ingestion
`POST /api/fetchGames`

- Fetches today’s MLB schedule.
- Normalizes team naming and builds canonical `matchKey` (`YYYY-MM-DD|awayTeam|homeTeam`).
- Resolves/attaches ballpark factors.
- Writes:
  - `mlb:games:today`
  - `mlb:ballparkFactors:current`

### 2) Odds ingestion
`POST /api/fetchOdds`

- Fetches US h2h moneylines from The Odds API.
- Normalizes to canonical odds records.
- Default behavior is cache-first.
- `?refresh=true` performs selective refresh:
  - preserves already-started games from cache,
  - refreshes upcoming games from live payload,
  - drops records with invalid/missing start time.
- Writes:
  - `mlb:odds:today`

### 3) Pitcher stats ingestion
`POST /api/fetchPitcherStats`

- Resolves probable starters.
- Pulls MLB season stats and merges Savant advanced metrics when available.
- Writes:
  - `mlb:stats:pitchers`
  - `mlb:stats:pitchers:meta`

### 4) Bullpen stats ingestion
`POST /api/fetchBullpenStats`

- Builds bullpen quality and recent workload/fatigue context.
- Writes:
  - `mlb:stats:bullpen`
  - `mlb:stats:bullpen:meta`

### 5) Team offense stats ingestion
`POST /api/fetchTeamOffenseStats`

- Builds team offense baselines, splits/form, and contact-quality signals.
- Writes:
  - `mlb:stats:offense`
  - `mlb:stats:offense:meta`

### 6) Prediction generation
`POST /api/runModel`

- Uses cached schedule + stats to compute per-game win probabilities.
- Model combines:
  - Team Elo baseline
  - Starting pitcher component
  - Bullpen component
  - Offense component
  - Ballpark/environment adjustments
  - Home-field adjustment
- Writes:
  - `mlb:predictions:today`
  - `mlb:predictions:YYYY-MM-DD`

If required cached stats are missing, this step fails and signals that stats pipeline must run first.

### 7) Edge detection
`POST /api/findEdges`

- Joins predictions and odds by `matchKey`.
- Converts moneylines to implied probabilities.
- Emits edges when `edge > 0.03` (3%).
- Writes:
  - `mlb:edges:today`

### 8) Stats orchestration
`POST /api/runStatsPipeline`

Runs, in order:

```text
fetchPitcherStats -> fetchBullpenStats -> fetchTeamOffenseStats
```

- Uses Eastern-date idempotency marker:
  - `mlb:cron:statsPipeline:YYYY-MM-DD`
- Skips duplicate runs on same ET date unless `?force=true`.

### 9) Market orchestration
`POST /api/runPipeline`

Runs, in order:

```text
fetchOdds?refresh=true -> runModel -> findEdges
```

Requires same-day games/stats caches from `runStatsPipeline` to exist first. If not prepared yet, returns `409` (`GAMES_CACHE_MISSING` or `GAMES_CACHE_STALE`) with guidance to run stats first.
Writes game, odds, prediction, and edge cache keys used by dashboard/public routes.

### 10) Historical + evaluation workflow

1. `POST /api/loadHistorical`
   - Loads final MLB games by season window (`startSeason`, `endSeason`).
   - Writes `mlb:games:historical:<season>` and `mlb:games:historical:meta`.
2. `POST /api/evaluatePredictions`
   - Compares stored `mlb:predictions:<date>` vs historical finals.
   - Persists daily summaries to `mlb:evaluation:<date>` by default.
3. `GET /api/evaluation`
   - Reads persisted summaries over date window/limit.

---

## Repository Structure

```text
pages/
  index.js                           # protected dashboard UI
  stats.js                           # protected cached-stats explorer
  login.js                           # password login UI
  api/
    predictions.js                   # public cached predictions (GET)
    edges.js                         # public cached edges (GET)
    odds.js                          # public cached odds (GET)
    stats.js                         # public cached stats sections (GET)
    evaluation.js                    # public cached evaluation summaries (GET)

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

    loadHistorical.js                # historical final-results loader
    buildRatings.js                  # historical Elo rating build helper
    evaluatePredictions.js           # prediction-vs-results evaluator

    cron/
      runDailyStatsPipeline.js       # cron entry for stats workflow
      runDailyPipeline.js            # cron entry for market workflow

lib/
  apiSecurity.js                     # auth/method guards for API routes
  apiGuards.js                       # rate limiting, lock, cooldown helpers
  pipeline.js                        # shared prediction/edge pipeline logic
  cronSchedule.js                    # ET date/window helpers
  normalizeOdds.js                   # canonical odds normalization
  ballparkFactors.js                 # park-factor resolution and fallback
  homePageProps.js                   # dashboard data/view-model assembly
  ...

model/
  predictor.js                       # core game prediction composition
  eloRatings.js
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
| `SCHEDULER_BASE_URL` | Optional local helper | `npm run test:scheduler` | Defaults to `http://localhost:3000` |
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

### Run the app

```bash
npm run dev
```

Open `http://localhost:3000`, then sign in at `/login` with `APP_PASSWORD`.

---

## Deployment (Vercel)

1. Import this repository into Vercel.
2. Add environment variables in **Project Settings → Environment Variables**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ODDS_API_KEY`
   - `ADMIN_API_SECRET`
   - `APP_PASSWORD`
   - optional: `CRON_SECRET`, `BALLPARK_FACTORS_URL`
3. Deploy.
4. Configure GitHub Actions secrets (below) if using scheduled automation.
5. Trigger and verify one manual pipeline run.

---

## Automation & Scheduling

### Recommended production scheduler: GitHub Actions

Workflow file: `.github/workflows/schedule-pipeline.yml`.

#### Stats workflow behavior

- Cron schedule targets the ET morning window.
- Job gates execution to **5:30 AM – 8:30 AM America/New_York**.
- Primary trigger path:
  - `POST /api/cron/runDailyStatsPipeline` when `CRON_SECRET` is present.
- Fallback trigger path:
  - `POST /api/runStatsPipeline` using admin auth when `CRON_SECRET` is not configured.

#### Market workflow behavior

- Cron schedule targets three ET windows.
- Job gates execution to:
  - 10:19 AM – 11:49 AM ET
  - 2:19 PM – 3:49 PM ET
  - 5:19 PM – 6:49 PM ET
- Trigger order:
  1. Run stats dependency first (`POST /api/cron/runDailyStatsPipeline?force=true` when `CRON_SECRET` is present, else `POST /api/runStatsPipeline`).
  2. Run market pipeline (`POST /api/runPipeline`) only after stats succeeds.
  3. If market returns `409`, workflow logs an explicit dependency message and stops (no silent/unknown failure).

> Note: The optional cron entry route `GET|POST /api/cron/runDailyPipeline` has its own strict internal check and runs only at **10:00 ET minute-match** unless `?force=true` is supplied.

### Required GitHub Actions secrets

- `PIPELINE_BASE_URL` (e.g., `https://your-app.vercel.app`)
- `ADMIN_API_SECRET`
- `CRON_SECRET` (required for cron endpoint path)
- `PIPELINE_AUTH_TOKEN` (optional override; defaults to `ADMIN_API_SECRET` in workflow logic)

### Optional direct cron usage

You may call `/api/cron/runDailyStatsPipeline` and/or `/api/cron/runDailyPipeline` from Vercel Cron or any external scheduler. Provide `Authorization: Bearer <CRON_SECRET>`. Any caller that triggers `/api/runPipeline` should invoke stats first in the same orchestration flow.

---

## API Reference

### Public read-only routes (no admin token)

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

### UI auth/session routes

#### `POST /api/login`
Body:

```json
{ "password": "..." }
```

Validates `APP_PASSWORD` and sets HTTP-only session cookie.

#### `POST /api/logout`
Clears the session cookie.

### Operational/admin routes

All require:

- `POST`
- Operational secret (normally `Authorization: Bearer <ADMIN_API_SECRET>`)

Accepted auth forms include:

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
- Internally invokes `runStatsPipeline` with operational auth.

#### `GET|POST /api/cron/runDailyPipeline`

Requires:

- `Authorization: Bearer <CRON_SECRET>`

Behavior:

- Runs only at **10:00 ET exact minute** unless `?force=true`.
- Uses ET-date idempotency marker `mlb:cron:dailyPipeline:YYYY-MM-DD`.
- Internally orchestrates dependency order: `runStatsPipeline` first, then `runPipeline`.
- If stats fails, route stops and returns the stats error payload.
- If market returns `409`, payload includes clear dependency context (`runStatsPipeline` must run first).

---

## Redis Keys

### Core day-of-game keys

- `mlb:games:today`
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

### Ballpark key

- `mlb:ballparkFactors:current`

### Historical/evaluation keys

- `mlb:games:historical:<season>`
- `mlb:games:historical:meta`
- `mlb:predictions:YYYY-MM-DD`
- `mlb:evaluation:YYYY-MM-DD`

### Orchestration markers/guards

- `mlb:cron:statsPipeline:YYYY-MM-DD`
- `mlb:cron:dailyPipeline:YYYY-MM-DD`
- `mlb:lock:*`
- `mlb:limit:*`
- `mlb:cooldown:*`

---

## Manual Verification

### Run stats pipeline

```bash
curl -X POST "http://localhost:3000/api/runStatsPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Run market pipeline

```bash
# required dependency first
curl -X POST "http://localhost:3000/api/runStatsPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"

# then run market pipeline
curl -X POST "http://localhost:3000/api/runPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Refresh odds selectively (preserve started games)

```bash
curl -X POST "http://localhost:3000/api/fetchOdds?refresh=true" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Load historical data by season window

```bash
curl -X POST "http://localhost:3000/api/loadHistorical?startSeason=2022&endSeason=2025" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Evaluate predictions over a date range

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

### Trigger cron route helper locally

```bash
CRON_SECRET=your-secret SCHEDULER_BASE_URL=http://localhost:3000 npm run test:scheduler
```

---

## Scripts

- `npm run dev` — start local Next.js dev server.
- `npm run build` — build for production.
- `npm run start` — run production server.
- `npm test` — run Node test suite (`tests/*.test.mjs`).
- `npm test -- --run tests/cronRoute.test.mjs tests/statsCronRoute.test.mjs tests/cronSchedule.test.mjs` — run targeted test files only.
- `npm run test:scheduler` — local cron-route trigger helper.
- `npm run screenshot:dashboard` — capture dashboard screenshot helper (if local app is running).

---

## Security Notes

- Never commit `.env.local` or real secrets.
- Rotate exposed credentials immediately.
- Keep `ADMIN_API_SECRET`, `CRON_SECRET`, and `APP_PASSWORD` distinct in production.
- Keep public routes read-only and cache-backed.
- Keep operational routes POST-only and secret-protected.

---

## Data Contracts

Canonical payload schemas and naming rules are maintained in:

- `docs/data-contracts.md`

If you change field names or payload shapes in any pipeline stage, update this document and keep all dependent stages aligned.

---

## Developer Note: Workflow YAML Validation

Quick local validation of scheduler workflow syntax:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/schedule-pipeline.yml'); puts 'ok'"
```

---

## Disclaimer

This project is for educational and analytical use. Sports betting carries financial risk—use responsibly and comply with local laws.
