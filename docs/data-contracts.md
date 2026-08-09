# MLB betting model data contracts

This document defines the canonical field names and required keys used across schedule ingestion, odds ingestion, prediction generation, and edge detection. Treat these contracts as the source of truth before changing API or model logic.

## Cache freshness metadata

Daily games, pitcher, bullpen, offense, predictions, and odds caches have adjacent
`:meta` keys. A missing daily metadata key remains readable for a non-destructive
legacy rollout. Once present, metadata must be an object with an ISO `dateKey` and
must match the current Eastern MLB date; malformed or stale metadata blocks model
or edge generation. Writers publish payload first and metadata last, while pipeline
locks prevent concurrent writers. Prediction metadata includes a record count so
edge generation cannot consume a partially published prediction snapshot.

`mlb:ratings:teams:meta` is mandatory and contains `generatedAt`, `dataThrough`,
`season`, `source`, `version`, and `gamesProcessed`. Ratings are accepted for eight
days. During the active season, `dataThrough` must also be within eight days. A stale
baseline fails with instructions to run `loadHistorical` followed by `buildRatings`;
the expensive historical API load is never triggered implicitly by a market refresh.

## Shared conventions

### `matchKey`

All stages should use the same deterministic game identifier:

```text
YYYY-MM-DD|awayTeam|homeTeam
```

Example:

```text
2025-04-10|New York Yankees|Boston Red Sox
```

Rules:

- Use the scheduled game date in UTC as `YYYY-MM-DD`.
- Use canonical MLB team display names.
- Preserve the `awayTeam` then `homeTeam` ordering.
- Do not include sportsbook identifiers, venue names, or pitcher names in `matchKey`.
- `matchKey` is required for `Game`, `OddsRecord`, `Prediction`, and `Edge`.

### Naming rules

- Use `homeTeam` and `awayTeam`, never `home_team` / `away_team` outside raw external API payload handling.
- Use `homeMoneyline` and `awayMoneyline` for the selected odds values used by edge detection.
- Use probabilities as decimals from `0` to `1`.
- Use ISO-8601 strings for timestamps and datetimes.

## Canonical contracts

### 1. `Game`

Represents a scheduled or historical MLB game after ingestion from the MLB schedule source.

#### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | `string \| number` | Provider-specific game identifier. |
| `matchKey` | `string` | Canonical key in `YYYY-MM-DD|awayTeam|homeTeam` format. |
| `date` | `string` | Scheduled game datetime in ISO-8601 format. |
| `homeTeam` | `string` | Canonical MLB team name. |
| `awayTeam` | `string` | Canonical MLB team name. |
| `seasonType` | `"regular" \| "playoffs" \| "spring"` | Classification derived from MLB game type. |
| `status` | `string` | Current or final game status from schedule ingestion. |

#### Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `season` | `number` | Required for historical rating inputs; optional for same-day schedule ingestion. |
| `homePitcher` | `string \| null` | Probable starter if known. |
| `awayPitcher` | `string \| null` | Probable starter if known. |
| `venue` | `string \| null` | Venue name if present. |
| `venueId` | `number \| null` | MLB venue identifier if present. |
| `ballpark` | `object \| null` | Normalized park-factor context attached by schedule ingestion. |
| `homeScore` | `number` | Required only once a game is final / historical. |
| `awayScore` | `number` | Required only once a game is final / historical. |

#### Stage requirements

- **Schedule ingestion (`fetchGames`)**: all required fields except `season`; `homePitcher`, `awayPitcher`, `venue`, `venueId`, and `ballpark` are optional; scores are not expected.
- **Historical ingestion (`loadHistorical`)**: `season`, `homeScore`, and `awayScore` become required in addition to the base required fields.
- **Prediction input (`runModel`)**: must include `gameId`, `matchKey`, `date`, `homeTeam`, `awayTeam`, and `seasonType`; pitchers are optional but strongly recommended.

### 2. `OddsRecord`

Represents the normalized odds for one game after sportsbook ingestion.

#### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | `string` | Odds-provider game identifier. |
| `matchKey` | `string` | Canonical key used to join against schedule and predictions. |
| `commenceTime` | `string` | Scheduled start datetime in ISO-8601 format. |
| `homeTeam` | `string` | Canonical MLB team name. |
| `awayTeam` | `string` | Canonical MLB team name. |
| `homeMoneyline` | `number` | Canonical selected home moneyline used for modeling. |
| `awayMoneyline` | `number` | Canonical selected away moneyline used for modeling. |
| `sportsbook` | `string` | Sportsbook that supplied the canonical selected moneyline pair. |
| `lastUpdated` | `string` | Timestamp for the selected sportsbook line. |

#### Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `sportsbooks` | `Array<object>` | Full book-by-book detail if the route chooses to persist it. |
| `primaryLine` | `object` | Selected canonical line mirrored into the top-level moneyline fields for downstream use. |
| `source` | `string` | Cache or provider metadata. |

#### Stage requirements

- **Odds ingestion (`fetchOdds`)**: all required fields above should be present on each stored record; if `sportsbooks` is retained, select a `primaryLine` and mirror it to the top-level required fields.
- **Edge detection (`findEdges`)**: requires `matchKey`, `homeMoneyline`, `awayMoneyline`, `sportsbook`, and `lastUpdated`; nested `sportsbooks` data is optional.

### 3. `Prediction`

Represents one model output for a single game.

#### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | `string \| number` | Source game identifier from schedule ingestion. |
| `matchKey` | `string` | Canonical key used to join with odds. |
| `date` | `string` | Scheduled game datetime in ISO-8601 format. |
| `homeTeam` | `string` | Canonical MLB team name. |
| `awayTeam` | `string` | Canonical MLB team name. |
| `homeWinProbability` | `number` | Decimal probability between `0` and `1`. |
| `awayWinProbability` | `number` | Decimal probability between `0` and `1`, expected to sum to ~1 with home probability. |
| `homeRating` | `number` | Composite modeled home rating. |
| `awayRating` | `number` | Composite modeled away rating. |

#### Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `homePitcher` | `string \| null` | Probable starter included in the model input/output. |
| `awayPitcher` | `string \| null` | Probable starter included in the model input/output. |
| `pitcherModel` | `object` | Optional detail block containing stored pitcher stats and scoring components. |
| `bullpenModel` | `object` | Optional detail block containing stored bullpen stats, fatigue features, and scoring components. |
| `venue` | `string \| null` | Venue name carried forward for display/debugging. |
| `ballpark` | `object` | Normalized park factors for the venue, including run/HR/hit environment and classification. |
| `ballparkModel` | `object` | Derived offense-side adjustments showing how the venue changed the rating inputs. |
| `modelVersion` | `string` | Optional metadata for reproducibility. |
| `generatedAt` | `string` | Optional prediction timestamp. |

#### Stage requirements

- **Prediction generation (`runModel`)**: every stored prediction must include all required fields.
- **Edge detection (`findEdges`)**: requires `matchKey`, team names, and win probabilities; ratings may be retained even if edge logic does not use them directly.

### 4. `Edge`

Represents a betting edge discovered by comparing a prediction with canonical odds.

#### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | `string \| number` | Source schedule or odds identifier retained for traceability. |
| `matchKey` | `string` | Canonical join key for the game. |
| `team` | `string` | Team side with the detected edge. |
| `market` | `"moneyline"` | Current supported market type. |
| `sportsbook` | `string` | Sportsbook attached to the selected odds. |
| `odds` | `number` | Moneyline used for the edge calculation. |
| `modelProbability` | `number` | Decimal model win probability for the selected side. |
| `impliedProbability` | `number` | Decimal implied probability derived from the odds. |
| `edge` | `number` | `modelProbability - impliedProbability`. |
| `threshold` | `number` | Minimum edge threshold that triggered inclusion. |

#### Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `homeTeam` | `string` | Helpful for downstream display or auditing. |
| `awayTeam` | `string` | Helpful for downstream display or auditing. |
| `lastUpdated` | `string` | Timestamp of the odds snapshot used. |
| `recommendation` | `string` | Optional human-readable label such as `bet` or `pass`. |

#### Stage requirements

- **Edge detection (`findEdges`)**: every emitted edge must include all required fields.
- **Downstream presentation/storage**: optional context fields may be added, but required field names must remain unchanged.

### 5. `EvaluationSummary`

Represents one persisted daily evaluation record written to Redis by `/api/evaluatePredictions`.

#### Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `date` | `string` | Evaluation day as `YYYY-MM-DD`. |
| `season` | `number` | Season inferred from `date`. |
| `sourceKeys.predictions` | `string` | Source prediction key (`mlb:predictions:<date>`). |
| `sourceKeys.historical` | `string` | Source historical key (`mlb:games:historical:<season>`). |
| `metrics.gamesPredicted` | `number` | Count of predictions eligible for evaluation. |
| `metrics.gamesMatchedToFinal` | `number` | Count of predictions matched to final results. |
| `metrics.coverageRate` | `number` | `gamesMatchedToFinal / gamesPredicted` (or `0`). |
| `metrics.accuracy` | `number` | Correct predictions divided by matched games (or `0`). |
| `metrics.brierScore` | `number` | Mean Brier score across matched games (or `0`). |
| `unmatchedStats.total` | `number` | Count of unmatched records encountered. |
| `unmatchedStats.byReason` | `object` | Reason histogram keyed by unmatched reason string. |
| `unmatchedStats.byType` | `object` | Type histogram keyed by unmatched record type. |
| `generatedAt` | `string` | ISO-8601 timestamp when summary was created. |

#### Persistence key

- `mlb:evaluation:<date>`

#### Source key shape inside each summary

- `sourceKeys.predictions` must be `mlb:predictions:<date>`.
- `sourceKeys.historical` must be `mlb:games:historical:<season>`.

#### Evaluation read route key shape

`GET /api/evaluation` returns each record with:

- `sourceKey`: `mlb:evaluation:<date>`

## Required vs optional by pipeline stage

| Stage | Required contract |
| --- | --- |
| Schedule ingestion | `Game` base required fields |
| Historical ingestion | `Game` base required fields + `season`, `homeScore`, `awayScore` |
| Odds ingestion | `OddsRecord` required fields |
| Prediction generation | `Prediction` required fields |
| Edge detection | `Prediction.matchKey` + `OddsRecord.matchKey` join, then emit `Edge` required fields |

## Implementation note

If a provider exposes different names or IDs, normalize them at the API boundary and preserve the canonical contract internally.

## Ballpark factor contract

When present on a `Game` or `Prediction`, `ballpark` should use normalized factors where `1.00` is league average.

| Field | Type | Notes |
| --- | --- | --- |
| `venue` | `string \| null` | Human-readable venue name. |
| `classification` | `"pitcher-friendly" \| "neutral" \| "hitter-friendly"` | Derived from `runFactor`. |
| `runFactor` | `number` | Overall run environment multiplier. |
| `homeRunFactor` | `number` | Home run multiplier. |
| `hitsFactor` | `number` | Hit environment multiplier. |
| `doublesTriplesFactor` | `number` | Doubles/triples multiplier when available. |
| `leftHandedHitterFactor` | `number` | Optional handedness split for left-handed hitters. |
| `rightHandedHitterFactor` | `number` | Optional handedness split for right-handed hitters. |

## Odds normalization strategy

- Retain every valid sportsbook line in `sportsbooks` when a bookmaker exposes an `h2h` market with both home and away prices.
- Choose `primaryLine` from the valid sportsbooks using the lowest implied hold (`home implied probability + away implied probability`).
- Mirror `primaryLine.homeMoneyline`, `primaryLine.awayMoneyline`, `primaryLine.sportsbook`, and `primaryLine.lastUpdated` to the required top-level fields so downstream consumers such as edge detection can read a single canonical shape without scanning the nested array.
- Skip bookmakers missing an `h2h` market or either team outcome instead of throwing, and drop the full game only when no valid sportsbook lines remain.

## Odds refresh policy (`POST /api/fetchOdds?refresh=true`)

- Refresh mode is **selective**.
- Started games are preserved from cached `mlb:odds:today` records.
- Upcoming games are replaced from the latest fetched odds payload.
- Records with invalid or missing `commenceTime` are excluded from merged output.
- The response reports:
  - `refreshMode: "selective"`
  - `updatedUpcoming`
  - `preservedStarted`
  - `droppedInvalid`

## Redis persistence types and freshness

All application payload keys are Redis **strings containing JSON** written with `SET` and read with `GET`; no application payload is stored as a Redis hash/list/set. Guard keys (`mlb:lock:*`, `mlb:limit:*`, and `mlb:cooldown:*`) are scalar strings/counters with short TTLs.

| Key | JSON shape | Main writer | Main reader |
| --- | --- | --- | --- |
| `mlb:games:today` | `Game[]` | `fetchGames` | model/stats pipeline |
| `mlb:games:today:meta` | `{dateKey,fetchedAt,gamesToday,...}` | `fetchGames` | pipeline/dashboard |
| `mlb:stats:pitchers` | `{version,byId,aliasMap}` | `fetchPitcherStats` | predictor |
| `mlb:stats:bullpen` | team-name keyed object | `fetchBullpenStats` | predictor |
| `mlb:stats:offense` | team-name keyed object | `fetchTeamOffenseStats` | predictor |
| `mlb:stats:*:meta` | `{dateKey,lastUpdatedAt,...}` | matching stats route | model/stats dashboard |
| `mlb:odds:today` | `OddsRecord[]` | `fetchOdds` | edges/dashboard |
| `mlb:odds:today:meta` | `{dateKey,fetchedAt,records}` | `fetchOdds` | edge pipeline/cache validation |
| `mlb:predictions:today` | `Prediction[]` | model pipeline | edges/dashboard |
| `mlb:predictions:<Eastern date>` | `Prediction[]` | model pipeline | evaluation |
| `mlb:edges:today` | `Edge[]` | edge pipeline | dashboard |

Daily metadata uses the `America/New_York` date. Existing deployments without the newer stats/odds metadata remain readable for a non-destructive rollout, but once metadata exists a mismatched date is rejected rather than treated as current data.

## Endpoint examples (new behavior)

### `POST /api/loadHistorical?startSeason=2022&endSeason=2025`

Response shape:

```json
{
  "seasonsLoaded": 4,
  "gamesCollected": 9720,
  "seasonRange": {
    "startSeason": 2022,
    "endSeason": 2025
  },
  "keysWritten": [
    "mlb:games:historical:2022",
    "mlb:games:historical:2023",
    "mlb:games:historical:2024",
    "mlb:games:historical:2025",
    "mlb:games:historical:meta"
  ]
}
```

### `POST /api/evaluatePredictions`

Request body:

```json
{
  "dateFrom": "2025-04-01",
  "dateTo": "2025-04-07",
  "persist": true
}
```

Response highlights:

```json
{
  "ok": true,
  "dateRange": {
    "dateFrom": "2025-04-01",
    "dateTo": "2025-04-07",
    "totalDays": 7
  },
  "persist": true,
  "aggregate": {
    "gamesPredicted": 92,
    "gamesMatchedToFinal": 90,
    "coverageRate": 0.9783,
    "accuracy": 0.5667,
    "brierScore": 0.2412
  },
  "unmatchedStats": {
    "total": 2,
    "byReason": {
      "missing_final_result": 2
    },
    "byType": {
      "prediction": 2
    }
  },
  "perDay": [
    {
      "date": "2025-04-01",
      "season": 2025,
      "sourceKeys": {
        "predictions": "mlb:predictions:2025-04-01",
        "historical": "mlb:games:historical:2025"
      }
    }
  ]
}
```

### `GET /api/evaluation?dateFrom=2025-04-01&dateTo=2025-04-07&limit=30`

Response highlights:

```json
{
  "evaluations": [
    {
      "date": "2025-04-01",
      "sourceKey": "mlb:evaluation:2025-04-01",
      "sourceKeys": {
        "predictions": "mlb:predictions:2025-04-01",
        "historical": "mlb:games:historical:2025"
      }
    }
  ],
  "metadata": {
    "returnedDays": 1,
    "dateRangeApplied": {
      "dateFrom": "2025-04-01",
      "dateTo": "2025-04-07",
      "limit": 30
    }
  }
}
```

## Game identity v2 and publication metadata

MLB schedule games use `v2|mlb|<gamePk>` as `matchKey`; `gamePk` is authoritative and
the schedule also retains Eastern date, scheduled time, game number, doubleheader
designation, and status. Odds provider IDs remain as `providerGameId`. Cross-provider
matching uses normalized teams plus Eastern date, then an explicit provider mapping or
nearest scheduled time within 90 minutes. Equal-distance or otherwise ambiguous matches
are rejected and reported, never guessed. Legacy team/date keys remain readable but are
not rewritten or deleted.

Stats refresh candidates are staged at `mlb:stats:<kind>:candidate`, with every attempt's
diagnostics at `mlb:stats:<kind>:refresh:meta`. Only healthy candidates replace current
payload and metadata. Edges have companion lineage metadata at `mlb:edges:today:meta`.
