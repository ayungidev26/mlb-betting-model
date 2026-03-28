# MLB Betting Model

A password-protected, serverless MLB prediction and betting-edge application built with Next.js API routes, Upstash Redis, and scheduled automation.

---

## Project Overview

This project ingests MLB schedule + odds + team/player stats, builds model predictions, and flags moneyline edges where the model's probability exceeds market implied probability.

At a high level, the system now runs two workflows:

1. **Stats pipeline** (early morning ET, once per Eastern day): fetch pitcher, bullpen, and offense stats into Redis cache.
2. **Market pipeline** (in-day): fetch today's games + odds, run the model from cached stats, and find edges.

The web UI reads cached predictions/edges from Redis and presents the top opportunities.

---

## Tech Stack & Architecture

- **Runtime / framework:** Next.js (Pages Router) serverless functions
- **Hosting:** Vercel
- **Data store:** Upstash Redis (REST API)
- **External data sources:**
  - MLB Stats API (schedule, team/player stats)
  - Baseball Savant CSV leaderboard exports (advanced expected/contact metrics)
  - The Odds API (US moneyline odds)
- **Scheduler:**
  - Recommended: GitHub Actions workflow (`.github/workflows/schedule-pipeline.yml`)
  - Optional legacy route: `/api/cron/runDailyPipeline`

### Request Access Model

There are three API access tiers:

1. **Public cache read routes** (`GET /api/predictions`, `GET /api/edges`, `GET /api/stats`, `GET /api/evaluation`)
2. **Operational/admin routes** (all model/data pipeline mutation routes; require admin secret and `POST`)
3. **Cron routes** (`/api/cron/*`; require cron secret; accept `GET` or `POST`)

### App Authentication (UI)

- Middleware redirects anonymous traffic to `/login`.
- Login posts to `/api/login`, validates against `APP_PASSWORD`, and sets an HTTP-only cookie.
- Session TTL is **5 minutes**.
- `/api/login`, `/api/logout`, `/api/runPipeline`, `/api/runStatsPipeline`, and `/api/cron/*` bypass UI middleware redirect checks.

---

## Repository Structure

```text
pages/
  index.js                         # dashboard (predictions + edges)
  stats.js                         # cached model-input stats explorer
  login.js                         # password gate UI
  api/
    fetchGames.js
    fetchOdds.js
    fetchPitcherStats.js
    fetchBullpenStats.js
    fetchTeamOffenseStats.js
    runModel.js
    findEdges.js
    runPipeline.js
    runStatsPipeline.js
    loadHistorical.js
    buildRatings.js
    predictions.js                 # public cached predictions
    edges.js                       # public cached edges
    stats.js                       # public cached stats + metadata
    evaluation.js                  # public cached evaluation summaries
    cron/runDailyPipeline.js       # optional market cron trigger
    cron/runDailyStatsPipeline.js  # optional stats cron trigger

lib/
  pipeline.js                      # shared prediction/edge pipeline helpers
  apiSecurity.js                   # route auth and method guards
  apiGuards.js                     # IP rate limits, locks, cooldowns
  ballparkFactors.js               # park-factor loading/normalization
  upstreamFetch.js                 # resilient upstream fetch wrapper
  ...

model/
  predictor.js                     # combines Elo + pitcher + bullpen + offense + park + HFA
  eloRatings.js
  pitcherRatings.js
  bullpenRatings.js
  offenseRatings.js

data/
  ballparkFactors.js               # bundled fallback park-factor data

docs/
  data-contracts.md                # canonical payload contracts

scripts/
  run-daily-scheduler.mjs          # local/manual cron route verification helper
```

---

## Data Flow (Games → Odds → Model → Predictions)

### 1) Schedule ingestion
`POST /api/fetchGames`

- Pulls today's MLB schedule.
- Normalizes teams + builds canonical `matchKey`.
- Enriches each game with venue and ballpark factors.
- Stores:
  - `mlb:games:today`
  - `mlb:ballparkFactors:current`

### 2) Odds ingestion
`POST /api/fetchOdds`

- Pulls US h2h moneylines from The Odds API.
- Normalizes into canonical odds shape and selected primary line.
- Supports cache-first behavior unless `?refresh=true`.
- Stores `mlb:odds:today`.

### 3) Pitcher stats ingestion
`POST /api/fetchPitcherStats`

- Resolves probable starters from today's games.
- Pulls season stats from MLB API.
- Merges advanced metrics from Baseball Savant where available.
- Calculates fallback/derived values (e.g., FIP/xFIP/K-BB%) when needed.
- Stores `mlb:stats:pitchers`.

### 4) Bullpen stats ingestion
`POST /api/fetchBullpenStats`

- Pulls bullpen performance + recent usage/fatigue context.
- Stores `mlb:stats:bullpen`.

### 5) Team offense stats ingestion
`POST /api/fetchTeamOffenseStats`

- Pulls team offensive baseline + splits + recent form + advanced contact metrics.
- Stores `mlb:stats:offense`.

### 6) Prediction generation
`POST /api/runModel`

For each game, model computes composite ratings using:

- Team Elo baseline
- Starting pitcher component
- Bullpen component
- Offense component
- Ballpark adjustment component
- Home-field adjustment

Then converts rating differential to win probability and stores:

- `mlb:predictions:today`
- `mlb:predictions:YYYY-MM-DD`

### 7) Edge detection
`POST /api/findEdges`

- Converts moneylines to implied probabilities.
- Compares model probabilities vs implied probabilities.
- Emits edges when `edge > 0.03` (3%).
- Stores `mlb:edges:today`.

### 8) Stats orchestration
`POST /api/runStatsPipeline`

Runs the stats-only steps in sequence:

```text
fetchPitcherStats
fetchBullpenStats
fetchTeamOffenseStats
```

- Stores daily idempotency marker key `mlb:cron:statsPipeline:YYYY-MM-DD`.
- Skips repeat runs on the same Eastern date unless `?force=true` is provided.
- Writes metadata keys:
  - `mlb:stats:pitchers:meta`
  - `mlb:stats:bullpen:meta`
  - `mlb:stats:offense:meta`

### 9) Market orchestration
`POST /api/runPipeline`

Runs market/model steps only:

```text
fetchGames
fetchOdds (forced refresh)
runModel
findEdges
```

`runModel` reads cached stats from:

- `mlb:stats:pitchers`
- `mlb:stats:bullpen`
- `mlb:stats:offense`

If stats are missing, it returns a `STATS_PIPELINE_REQUIRED` error.


### 10) Stats cache read endpoint
`GET /api/stats`

- Read-only route that returns the latest cached model-input stats for:
  - `mlb:stats:pitchers` + `mlb:stats:pitchers:meta`
  - `mlb:stats:bullpen` + `mlb:stats:bullpen:meta`
  - `mlb:stats:offense` + `mlb:stats:offense:meta`
- Does **not** trigger a stats refresh; it only reads existing Redis values.

### 11) UI tabs

The authenticated UI now has two primary tabs:

- **Dashboard** (`/`): predictions, edges, and betting board filters
- **Stats** (`/stats`): read-only view of the latest cached pitcher, bullpen, and offense payloads with per-section metadata (last updated and record counts)

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes | API + UI | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | API + UI | Upstash REST token |
| `ODDS_API_KEY` | Yes (pipeline) | `/api/fetchOdds` | The Odds API key |
| `ADMIN_API_SECRET` | Yes (operational routes) | all admin `POST` routes | Required bearer token (`Authorization: Bearer ...`) |
| `CRON_SECRET` | Required only if using cron routes | `/api/cron/runDailyPipeline`, `/api/cron/runDailyStatsPipeline` | Separate secret for cron endpoints |
| `APP_PASSWORD` | Yes for UI access | login + middleware | Shared app password |
| `SCHEDULER_BASE_URL` | Optional local helper | `npm run test:scheduler` | Defaults to `http://localhost:3000` |
| `BALLPARK_FACTORS_URL` | Optional | ballpark factor loader | Remote JSON/CSV park-factor feed; fallback to bundled data |

---

## Developer Notes

### Validate GitHub Actions workflow YAML locally

Use Ruby's built-in YAML parser (no extra package install required):

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/schedule-pipeline.yml'); puts 'ok'"
```

Notes:

- Operational routes accept `x-admin-secret` header and JSON body fallbacks (`adminSecret`, `authToken`) in addition to bearer parsing logic used by scheduler workflows.
- If `ADMIN_API_SECRET` is unset, code falls back to `CRON_SECRET` for operational access, but this is not recommended for production separation of concerns.

---

## Local Setup

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

Fill all required values in `.env.local`.

### Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with `APP_PASSWORD`.

---

## API Reference

### Public read routes

#### `GET /api/predictions`
Returns cached predictions + summary.

#### `GET /api/edges`
Returns cached edges + summary.

#### `GET /api/stats`
Returns cached stats sections + metadata.

#### `GET /api/evaluation`
Read-only endpoint for persisted daily evaluation summaries (`mlb:evaluation:<date>`).

Query params:

- `dateFrom` (optional, `YYYY-MM-DD`)
- `dateTo` (optional, `YYYY-MM-DD`)
- `limit` (optional, default `30`, max `180`)

Response highlights:

- `evaluations`: array of persisted day summaries sorted by date ascending
- `metadata.returnedDays`: number of day summaries returned
- `metadata.dateRangeApplied`: effective date window and applied limit

### Auth routes

#### `POST /api/login`
Body:

```json
{ "password": "..." }
```

Sets secure HTTP-only session cookie on success.

#### `POST /api/logout`
Clears session cookie.

### Operational (admin) routes

All require:

- `POST`
- `Authorization: Bearer <ADMIN_API_SECRET>` (or equivalent accepted secret header/body fallback)

Endpoints:

- `/api/fetchGames`
- `/api/fetchOdds`
- `/api/fetchPitcherStats`
- `/api/fetchBullpenStats`
- `/api/fetchTeamOffenseStats`
- `/api/runModel`
- `/api/findEdges`
- `/api/runPipeline`
- `/api/runStatsPipeline`
- `/api/loadHistorical`
- `/api/buildRatings`

### Cron route (optional)

#### `GET|POST /api/cron/runDailyPipeline`

Requires:

- `Authorization: Bearer <CRON_SECRET>`

Behavior:

- Runs only during the configured New York execution minute unless `?force=true` is supplied.
- Uses Redis idempotency marker key `mlb:cron:dailyPipeline:YYYY-MM-DD`.
- Internally invokes `/api/runPipeline`.

#### `GET|POST /api/cron/runDailyStatsPipeline`

Requires:

- `Authorization: Bearer <CRON_SECRET>`

Behavior:

- Runs only during `5:30 AM – 8:30 AM` America/New_York unless `?force=true` is supplied.
- Internally invokes `/api/runStatsPipeline`.

---

## Automation & Scheduling

### Recommended production automation: GitHub Actions

Workflow: `.github/workflows/schedule-pipeline.yml`

Current behavior:

- **Stats refresh schedule:** targets `5:30 AM` ET with a guarded window of `5:30–8:30 AM` ET.
- **Market refresh schedule:** remains `10:19 AM`, `2:19 PM`, and `5:19 PM` ET windows.
- Stats job calls `POST /api/cron/runDailyStatsPipeline` when `CRON_SECRET` is configured, otherwise it falls back to `POST /api/runStatsPipeline` using admin auth.
- Market job calls `POST /api/runPipeline`.

Required GitHub secrets:

- `PIPELINE_BASE_URL` (example: `https://your-app.vercel.app`)
- `CRON_SECRET` (used by stats cron endpoint)
- `ADMIN_API_SECRET` (must match deployed app env)
- `PIPELINE_AUTH_TOKEN` (optional override; defaults to `ADMIN_API_SECRET`)

### Optional cron endpoint path

If you use Vercel Cron or another scheduler directly against `/api/cron/runDailyPipeline` or `/api/cron/runDailyStatsPipeline`, provide `CRON_SECRET` and align schedule timing with each route's time-window check.

---

## Deployment (Vercel)

1. Import this repo into Vercel.
2. Set environment variables in Vercel Project Settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ODDS_API_KEY`
   - `ADMIN_API_SECRET`
   - `APP_PASSWORD`
   - optional: `CRON_SECRET`, `BALLPARK_FACTORS_URL`
3. Deploy.
4. Configure GitHub Actions secrets for scheduler workflow.
5. Manually verify one pipeline run after deploy.

---

## Manual Verification

### Run full pipeline

```bash
curl -X POST "http://localhost:3000/api/runPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Run stats pipeline

```bash
curl -X POST "http://localhost:3000/api/runStatsPipeline" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

### Check cached outputs

- `mlb:games:today`
- `mlb:odds:today`
- `mlb:stats:pitchers`
- `mlb:stats:bullpen`
- `mlb:stats:offense`
- `mlb:predictions:today`
- `mlb:edges:today`

### Test cron route locally

```bash
CRON_SECRET=your-secret SCHEDULER_BASE_URL=http://localhost:3000 npm run test:scheduler
```

---

## Data Contracts

Canonical payload schema and naming rules live in:

- `docs/data-contracts.md`

If you modify field names or payload shape in any stage, update that document first and keep all pipeline stages consistent.

---

## Scripts

- `npm run dev` — run local Next.js dev server
- `npm run build` — production build
- `npm run start` — run production server
- `npm test` — Node test suite (`tests/*.test.mjs`)
- `npm run test:scheduler` — local/manual scheduler endpoint test helper

---

## Security Notes

- Never commit `.env.local` or secrets.
- Rotate any leaked tokens immediately.
- Keep `ADMIN_API_SECRET`, `CRON_SECRET`, and `APP_PASSWORD` distinct in production.
- Public routes should remain read-only and cache-backed.

---

## Disclaimer

This project is for educational and analytical use. Betting carries financial risk—use responsibly and comply with local laws.
