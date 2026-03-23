# MLB Betting Model

## Overview

This application is a serverless MLB betting model that collects game data, builds predictive ratings, compares model probabilities to sportsbook odds, and identifies betting edges.

The system runs entirely in the cloud using a modern serverless architecture powered by **Next.js APIs**, **Vercel**, and **Upstash Redis**.

The model evaluates each MLB game using a combination of:

* Historical team strength (Elo rating system)
* Starting pitcher performance
* Bullpen strength
* Team offense strength (season, split, rolling-form, and expected-contact inputs)
* Ballpark factors (run, HR, hit, doubles/triples, and handedness splits when available)
* Home field advantage
* Sportsbook betting odds

By comparing model win probabilities to sportsbook implied probabilities, the system automatically identifies games where the model believes the sportsbook odds are mispriced.

---

## Architecture

Cloud stack:

* Frontend/API hosting: Vercel
* Serverless API layer: Next.js
* Database: Upstash Redis
* Data source: MLB Stats API
* Odds source: Odds API

### Secret Storage

Operational auth and provider credentials must be stored in environment-variable secret managers, not in source control.

Recommended locations:

* **Production / Preview:** Vercel Project Settings → Environment Variables (store `ADMIN_API_SECRET`, `CRON_SECRET`, and provider credentials there).
* **Scheduled jobs / cron:** Use the Vercel-managed `CRON_SECRET` so Vercel automatically adds the expected bearer token when invoking the cron route.
* **Local development only:** `.env.local` on your machine, which must stay uncommitted.

Do **not** hardcode bearer tokens in the repo, client-side code, or test fixtures meant for deployment. If a token is exposed, rotate it immediately.

### App Password Protection

The homepage is protected by a lightweight password gate:

* Anonymous visitors are redirected to `/login` by `middleware.js`.
* The login form posts the password to `/api/login`.
* The API route compares the submitted password to `APP_PASSWORD` on the server and, when valid, issues an HTTP-only session cookie.
* If the password is wrong, the login request is rejected and the app remains hidden.

Local setup:

1. Copy `.env.example` to `.env.local`.
2. Set `APP_PASSWORD` to the shared password you want to require.
3. Start the app with `npm run dev`.
4. Visit the app and enter the password on the login screen.

### Required Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token. |
| `ODDS_API_KEY` | Yes | Auth for The Odds API. |
| `ADMIN_API_SECRET` | Yes | Secures the admin-only operational API routes. |
| `CRON_SECRET` | Yes | Secures the public cron endpoint that Vercel invokes automatically. |
| `APP_PASSWORD` | Yes | Shared password required to unlock the web app via the lightweight login screen. |
| `SCHEDULER_BASE_URL` | Local/manual only | Base URL used by `npm run test:scheduler` for manual verification. Defaults to `http://localhost:3000`. |
| `BALLPARK_FACTORS_URL` | Optional | External JSON or CSV feed for normalized ballpark factors. When omitted, the app falls back to the bundled baseline dataset in `data/ballparkFactors.js`. |

---

## Model Pipeline

The application runs a data pipeline that builds predictions and detects betting edges.

### 1. Fetch Today's MLB Games

`/api/fetchGames`

Pulls the current MLB schedule from the MLB Stats API and stores the games in Redis.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

Stored in Redis:

```
mlb:games:today
```

Data includes:

* Teams
* Game date
* Probable starting pitchers
* Venue
* Venue ID
* Ballpark factors (`runFactor`, `homeRunFactor`, `hitsFactor`, `doublesTriplesFactor`, handedness splits, and derived classification)
* Season type (spring / regular / playoffs)

Ballpark source notes:

* The app first checks `BALLPARK_FACTORS_URL` for a normalized JSON or CSV feed.
* If no external feed is configured, it uses the bundled baseline in `data/ballparkFactors.js`.
* All factors are normalized to `1.00 = league average`.
* Park classification is derived from `runFactor`:
  * `< 0.95` → pitcher-friendly
  * `0.95 - 1.05` → neutral
  * `> 1.05` → hitter-friendly

The current ballpark lookup cache is also written to Redis:

```
mlb:ballparkFactors:current
```

---

### 2. Fetch Sportsbook Odds

`/api/fetchOdds`

Pulls sportsbook moneyline odds and stores them for comparison with model predictions.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

Stored in Redis:

```
mlb:odds:today
```

---

### 3. Collect Pitcher Statistics

`/api/fetchPitcherStats`

Retrieves season statistics for the probable starting pitchers.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

Metrics collected:

* ERA
* WHIP
* Strikeouts
* Innings pitched
* xERA
* FIP
* xFIP
* K%
* BB%
* K-BB%
* BAA (batting average against)
* xBAA (expected batting average against)
* SLG against
* xSLG against
* Hard Hit%
* Barrel%
* Average exit velocity allowed

Source notes:

* Traditional season totals continue to come from the MLB Stats API `people/{id}/stats` pitching payload.
* Statcast / expected metrics (`xERA`, `xBAA`, `xSLG`, `Hard Hit%`, `Barrel%`, `Average Exit Velocity`, plus direct `K%` and `BB%` when present) are merged from the Baseball Savant custom leaderboard export for pitchers.
* `FIP` is calculated locally from the MLB season totals when the upstream payload does not expose a native `fip` field.
* `xFIP` is calculated locally from MLB season totals plus a league HR/FB context derived from current-season team pitching totals.
* `K-BB%` is calculated as `K% - BB%` whenever the API does not provide it directly.
* Percentage fields are normalized to decimals in storage and model inputs (for example, `0.312` for `31.2%`).

Stored in Redis:

```
mlb:stats:pitchers
```

---

### 4. Collect Bullpen Statistics

`/api/fetchBullpenStats`

Retrieves pitching statistics for each MLB team's bullpen.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

Metrics collected:

* Team bullpen ERA
* Team bullpen WHIP
* Team bullpen FIP
* Team bullpen xFIP
* Team bullpen K%
* Team bullpen BB%
* Team bullpen K-BB%
* Team bullpen HR/9
* Team bullpen opponent batting average
* Team bullpen LOB%
* Team bullpen Hard Hit%
* Team bullpen Barrel%
* Team bullpen average exit velocity
* Bullpen innings pitched over the last 3 days
* Bullpen innings pitched over the last 5 days
* Number of relievers used yesterday
* Whether key relievers appeared on back-to-back days

Source and mapping notes:

* Relief-only season aggregates are requested from the MLB Stats API with `sitCodes=rp` and fall back to the full team pitching split if the relief split is unavailable.
* `FIP` prefers a native field when present and otherwise is calculated from bullpen HR, BB, HBP, K, and innings.
* `xFIP` prefers a native field when present and otherwise is calculated from bullpen fly balls plus a league HR/FB context derived from current-season team pitching totals.
* `K-BB%` is stored as `strikeoutRate - walkRate` when the upstream payload does not expose it directly.
* `Hard Hit%`, `Barrel%`, and `Average Exit Velocity` are aggregated from Baseball Savant reliever-level Statcast metrics and weighted by reliever workload.
* Percentage fields continue to be stored as decimals (for example, `0.274` for `27.4%`).

Stored in Redis:

```
mlb:stats:bullpen
```

---

### 5. Collect Team Offense Statistics

`/api/fetchTeamOffenseStats`

Retrieves team-level offense metrics and contextual splits for every MLB club.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

Metrics collected:

* Runs per game
* Team batting average
* On-base percentage (OBP)
* Slugging percentage (SLG)
* OPS
* Isolated Power (ISO)
* Strikeout rate (K%)
* Walk rate (BB%)
* Weighted On-Base Average (wOBA)
* Weighted Runs Created Plus (`wRC+` approximation when a direct team field is unavailable)
* Expected batting average (`xBA`)
* Expected slugging (`xSLG`)
* Expected weighted On-Base Average (`xwOBA`)
* Hard Hit%
* Barrel%
* Season splits vs right-handed pitchers and vs left-handed pitchers
* Home and away offense splits
* Rolling last-7-day and last-14-day offense snapshots built from team game logs

Source and mapping notes:

* Core team totals and split slash/rate stats come from the MLB Stats API `teams/{teamId}/stats` hitting payload.
* `wOBA`, `xBA`, `xSLG`, `xwOBA`, `Hard Hit%`, and `Barrel%` are merged from a team-weighted Baseball Savant batter leaderboard export.
* The current team stats payload does not expose a direct team `wRC+` field consistently, so the pipeline stores a league-indexed `wOBA` approximation in the `weightedRunsCreatedPlus` field and labels that mapping in the cached payload.
* Percentage fields are normalized to decimals in storage and model inputs (for example, `0.338` for `33.8%`).

Stored in Redis:

```
mlb:stats:offense
```

---

### 6. Run Prediction Model

`/api/runModel`

The prediction engine calculates win probabilities for each game using:

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

```
Team Elo Rating
+ Starting Pitcher Rating
+ Bullpen Strength
+ Team Offense Strength
+ Ballpark Adjustment
+ Home Field Advantage
```

The offense model now contributes season baseline production plus contextual features derived from the cached splits, including:

* `offense_vs_handedness`
* `recent_offense_form`
* `power_score`
* `plate_discipline_score`

Ballpark factors are applied in the model as follows:

* `runFactor` adjusts each offense's expected scoring environment.
* `homeRunFactor` amplifies or suppresses power based on team quality of contact plus the opposing starter's HR/fly-ball exposure.
* `hitsFactor` and `doublesTriplesFactor` nudge contact-oriented run creation up or down.
* `leftHandedHitterFactor` / `rightHandedHitterFactor` are used when available, with the opposing starter's throwing hand acting as a same-day proxy for which side of the lineup is most likely to benefit.
* The resulting venue adjustments are stored in `ballparkModel.home` and `ballparkModel.away` so the UI can show how the park moved each side's rating.

Predictions are stored in Redis:

```
mlb:predictions:today
mlb:predictions:YYYY-MM-DD
```

---

### 7. Detect Betting Edges

`/api/findEdges`

The model compares predicted win probabilities to sportsbook implied probabilities.

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

If the model probability exceeds sportsbook probability by a threshold, the system identifies a **betting edge**.

Edges are stored in Redis:

```
mlb:edges:today
```

---

### 8. Run the Full Daily Pipeline

`/api/runPipeline`

Runs the full daily workflow in order and returns a per-step execution summary:

Operational access:

* Requires `POST`
* Requires `Authorization: Bearer <ADMIN_API_SECRET>`

```
fetchGames
fetchOdds
fetchPitcherStats
fetchBullpenStats
fetchTeamOffenseStats
runModel
findEdges
```

The orchestration route forces a fresh odds refresh, then leaves the latest outputs in Redis under the existing daily keys, including:

```
mlb:ballparkFactors:current
mlb:predictions:today
mlb:edges:today
```

Historical bootstrap and ratings rebuild endpoints are also admin-only:

* `/api/loadHistorical`
* `/api/buildRatings`

Both require `POST` plus `Authorization: Bearer <ADMIN_API_SECRET>`.

---

## Daily Scheduler

### Scheduled Endpoint

`/api/cron/runDailyPipeline`

This endpoint is the production scheduler entrypoint. It does **not** duplicate the pipeline logic; it securely invokes the existing `/api/runPipeline` orchestration route in-process.

Security and behavior:

* Accepts `GET` for Vercel Cron and secure manual testing.
* Requires `Authorization: Bearer <CRON_SECRET>`.
* Uses `America/New_York` to evaluate whether the current local hour is `10`.
* Stores a daily idempotency marker in Redis so duplicate cron deliveries do not rerun the pipeline for the same Eastern date.
* Leaves the existing `runPipeline` Redis lock in place to prevent overlapping executions.
* Supports `?force=true` for manual verification while still requiring the cron bearer token.

Redis key used by the scheduler:

```
mlb:cron:dailyPipeline:YYYY-MM-DD
```

### Why There Are Two Cron Expressions

Vercel cron schedules are UTC-based. To guarantee a 10:00 AM run in `America/New_York` across daylight saving transitions, this project schedules **both** of the UTC hours that can map to 10:00 AM Eastern:

* `0 14 * * *` → 10:00 AM during Eastern Daylight Time
* `0 15 * * *` → 10:00 AM during Eastern Standard Time

The cron route itself then verifies the local New York hour before running the pipeline, so only the correct daily invocation proceeds.

> **Important:** this DST-safe setup needs a Vercel plan that supports more than one cron job per day and minute-level cron timing. Vercel Hobby cron jobs only run once per day and may fire at any point within the configured hour, which is not sufficient for a production-grade 10:00 AM Eastern schedule.

### Cron Configuration

The project uses `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/runDailyPipeline",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/runDailyPipeline",
      "schedule": "0 15 * * *"
    }
  ]
}
```

### Manual Testing

Secure manual verification options:

1. Run the local helper script:

   ```bash
   CRON_SECRET=your-secret SCHEDULER_BASE_URL=http://localhost:3000 npm run test:scheduler
   ```

   The helper calls:

   ```
   GET /api/cron/runDailyPipeline?force=true
   Authorization: Bearer <CRON_SECRET>
   ```

2. Or call the endpoint directly:

   ```bash
   curl -X GET \
     -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/cron/runDailyPipeline?force=true"
   ```

---

## Example Model Output

```
Atlanta Braves vs Philadelphia Phillies

Model Win Probability:
ATL 58%
PHI 42%

Sportsbook Odds:
ATL -110 (52.4%)

Edge:
ATL +5.6%
```

---

## Redis Data Structure

```
mlb:games:today
mlb:odds:today
mlb:ratings:teams
mlb:stats:pitchers
mlb:stats:bullpen
mlb:stats:offense
mlb:predictions:today
mlb:predictions:YYYY-MM-DD
mlb:edges:today
mlb:cron:dailyPipeline:YYYY-MM-DD
```

---

## Serverless Workflow

The model runs the following pipeline:

```
fetchGames
fetchOdds
fetchPitcherStats
fetchBullpenStats
fetchTeamOffenseStats
runModel
findEdges
```

This produces a list of betting opportunities for the current MLB slate.

---

## Current Model Features

✔ 10+ years of historical team ratings  
✔ Starting pitcher strength modeling  
✔ Bullpen strength modeling  
✔ Team offense and split modeling  
✔ Home field advantage  
✔ Sportsbook odds comparison  
✔ Automated edge detection  
✔ Prediction history storage  
✔ Automated daily scheduling at 10:00 AM America/New_York

---

## Deploy and Verify

### Deploy

1. Add or confirm the required Vercel environment variables:
   * `UPSTASH_REDIS_REST_URL`
   * `UPSTASH_REDIS_REST_TOKEN`
   * `ODDS_API_KEY`
   * `ADMIN_API_SECRET`
   * `CRON_SECRET`
2. Deploy the project to Vercel on a plan that supports the two cron jobs in `vercel.json`.
3. After deployment, confirm the cron jobs appear in **Project Settings → Cron Jobs**.

### Verify

1. Trigger a secure manual run:

   ```bash
   curl -X GET \
     -H "Authorization: Bearer $CRON_SECRET" \
     "https://<your-deployment>/api/cron/runDailyPipeline?force=true"
   ```

2. Confirm the response reports `ok: true` and includes the nested pipeline summary.
3. Check Vercel runtime logs for `/api/cron/runDailyPipeline` and `/api/runPipeline`.
4. Confirm the latest Redis keys were refreshed:
   * `mlb:games:today`
   * `mlb:odds:today`
   * `mlb:stats:pitchers`
   * `mlb:stats:bullpen`
   * `mlb:predictions:today`
   * `mlb:edges:today`
5. On the next scheduled production run, confirm the cron invocation succeeds around 10:00 AM New York local time.

---

## Disclaimer

This project is for educational and analytical purposes only.
Sports betting involves risk and should be done responsibly.

## Manual Pipeline Testing

Use the existing admin-only routes to validate the full pipeline, including ballpark enrichment, end to end.

1. Start the app locally:

   ```bash
   npm install
   npm run dev
   ```

2. Set the required environment variables in `.env.local` (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ODDS_API_KEY`, `ADMIN_API_SECRET`, and optionally `CRON_SECRET` / `BALLPARK_FACTORS_URL`).

3. Load the daily data, pitching inputs, bullpen inputs, and offense inputs:

   ```bash
   curl -X POST http://localhost:3000/api/fetchGames \
     -H "Authorization: Bearer $ADMIN_API_SECRET"

   curl -X POST http://localhost:3000/api/fetchPitcherStats \
     -H "Authorization: Bearer $ADMIN_API_SECRET"

   curl -X POST http://localhost:3000/api/fetchBullpenStats \
     -H "Authorization: Bearer $ADMIN_API_SECRET"

   curl -X POST http://localhost:3000/api/fetchTeamOffenseStats \
     -H "Authorization: Bearer $ADMIN_API_SECRET"
   ```

4. Verify the cached schedule payload in Redis under `mlb:games:today`. Each game should now include:

   * `venue`
   * `venueId`
   * `ballpark.runFactor`
   * `ballpark.homeRunFactor`
   * `ballpark.hitsFactor`
   * `ballpark.doublesTriplesFactor`
   * `ballpark.leftHandedHitterFactor`
   * `ballpark.rightHandedHitterFactor`
   * `ballpark.classification`

   The shared lookup cache should also exist under `mlb:ballparkFactors:current`.

5. Verify the cached pitcher payload in Redis under `mlb:stats:pitchers`. Each pitcher record should now include:

   * `xera`
   * `fip`
   * `xfip`
   * `strikeoutRate`
   * `walkRate`
   * `strikeoutMinusWalkRate`
   * `battingAverageAgainst`
   * `expectedBattingAverageAgainst`
   * `sluggingAgainst`
   * `expectedSluggingAgainst`
   * `hardHitRate`
   * `barrelRate`
   * `averageExitVelocity`

6. Verify the cached offense payload in Redis under `mlb:stats:offense`. Each team record now includes:

   * `runsPerGame`
   * `battingAverage`
   * `onBasePercentage`
   * `sluggingPercentage`
   * `ops`
   * `isolatedPower`
   * `strikeoutRate`
   * `walkRate`
   * `weightedOnBaseAverage`
   * `weightedRunsCreatedPlus`
   * `expectedBattingAverage`
   * `expectedSlugging`
   * `expectedWeightedOnBaseAverage`
   * `hardHitRate`
   * `barrelRate`
   * `splits.vsRightHanded`
   * `splits.vsLeftHanded`
   * `splits.home`
   * `splits.away`
   * `splits.last7Days`
   * `splits.last14Days`

7. Run the rest of the pipeline and inspect the prediction output:

   ```bash
   curl -X POST http://localhost:3000/api/runPipeline \
     -H "Authorization: Bearer $ADMIN_API_SECRET"
   ```

   `mlb:predictions:today` now includes `pitcherModel`, `bullpenModel`, `offenseModel`, `ballpark`, and `ballparkModel` blocks with stored stat snapshots, split snapshots, venue factors, and per-side ballpark adjustments used during edge generation.

8. Verify the cached bullpen payload in Redis under `mlb:stats:bullpen`. Each team record should now include:

   * `era`
   * `whip`
   * `fip`
   * `xfip`
   * `strikeoutRate`
   * `walkRate`
   * `strikeoutMinusWalkRate`
   * `homeRunsPer9`
   * `battingAverageAgainst`
   * `leftOnBaseRate`
   * `hardHitRate`
   * `barrelRate`
   * `averageExitVelocity`
   * `usage.inningsLast3Days`
   * `usage.inningsLast5Days`
   * `usage.relieversUsedYesterday`
   * `usage.keyRelieversBackToBack`

9. Mapping assumptions for manual verification:

   * MLB Stats API `avg` is treated as bullpen opponent batting average.
   * MLB Stats API `leftOnBasePercentage` is treated as bullpen `LOB%`.
   * The fatigue metrics are derived from the previous five days of boxscore pitcher usage, using the first listed pitcher as the starter and the remaining pitchers as relievers.
   * When no external park-factor feed is configured, the bundled baseline dataset is used as a stable fallback.
   * Handedness-specific park factors use the opposing starter's throwing hand as a proxy because same-day confirmed batting-order handedness is not available during schedule ingestion.
