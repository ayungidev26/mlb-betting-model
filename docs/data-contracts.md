# MLB betting model data contracts

This document defines the canonical field names and required keys used across schedule ingestion, odds ingestion, prediction generation, and edge detection. Treat these contracts as the source of truth before changing API or model logic.

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
| `homeScore` | `number` | Required only once a game is final / historical. |
| `awayScore` | `number` | Required only once a game is final / historical. |

#### Stage requirements

- **Schedule ingestion (`fetchGames`)**: all required fields except `season`; `homePitcher`, `awayPitcher`, and `venue` are optional; scores are not expected.
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

## Odds normalization strategy

- Retain every valid sportsbook line in `sportsbooks` when a bookmaker exposes an `h2h` market with both home and away prices.
- Choose `primaryLine` from the valid sportsbooks using the lowest implied hold (`home implied probability + away implied probability`).
- Mirror `primaryLine.homeMoneyline`, `primaryLine.awayMoneyline`, `primaryLine.sportsbook`, and `primaryLine.lastUpdated` to the required top-level fields so downstream consumers such as edge detection can read a single canonical shape without scanning the nested array.
- Skip bookmakers missing an `h2h` market or either team outcome instead of throwing, and drop the full game only when no valid sportsbook lines remain.
