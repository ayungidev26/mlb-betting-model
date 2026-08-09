# Production-readiness audit — 2026-08-09

## Overall status: NEEDS ATTENTION

The local logic test suite passes, and the repository has substantial validation, authentication, cache-date, retry, and scheduling safeguards. It is not yet safe to call fully production-ready: doubleheaders share a match key, partial stats/prediction failures can be published as fresh success, edge/dashboard freshness is incomplete, and live provider/Redis/deployment behavior was not validated without credentials. One unambiguous historical-ingestion defect was fixed in this audit.

## Scope and evidence

Reviewed all tracked application, API, model, pipeline, Redis, workflow, deployment, documentation, and test files. Traced schedule → stats caches → ratings/model → predictions; odds → normalization → match join → best line/edge → dashboard; historical schedule → season keys → Elo → evaluation. No live paid Odds API call or production Redis write was made.

Local checks:

- `npm test`: 179/179 passed before the targeted fix; the targeted historical route test also passes after the fix.
- `npm ci`: attempted, but registry access stalled; interrupted without a successful install. This removed the prior local Next binary.
- `npm run build`: could not run afterward (`next: not found`), an environment/dependency-install limitation rather than evidence of a source defect.
- `npm audit --json`: registry advisory endpoint returned HTTP 403. No vulnerability conclusion can be drawn from that response. The repository policy script parsed the resulting empty report, so its success is not an audit result.
- No lint script or TypeScript configuration/check script is configured; source is JavaScript.

## End-to-end findings

### Stats pipeline

`runStatsPipeline` serially invokes schedule, pitcher, bullpen, then offense routes under an operational token, distributed lock, rate limits, and an Eastern-date marker. Schedule ingestion requests MLB sport 1 for the Eastern date, validates the outer payload, excludes spring/exhibition/non-MLB/terminal games, resolves park factors, and writes games plus dated metadata. The model later rejects stale game and stats metadata and stale team-rating metadata.

Pitcher data combines MLB season pages, team context, people metadata, and Savant values. Bullpen and offense loaders combine MLB and Savant data. However, those loaders deliberately tolerate individual upstream failures and can still write incomplete or empty objects with current-date metadata. Pitcher ingestion likewise logs low counts rather than rejecting them. Consequently the orchestration step can report success and the model can consume neutral/default inputs. Writes of payload and metadata are separate Redis commands, so a failure between them can leave a new payload with old metadata (later validation usually rejects it, but the update is not atomic).

The stats pipeline does not build team ratings or a separate pitcher-rating cache: team Elo is produced by the historical workflow; pitcher ratings are calculated at prediction time from `mlb:stats:pitchers`. That naming should be understood operationally.

### Market pipeline

`runPipeline` validates the current Eastern games cache, then invokes `fetchOdds?refresh=true`, `runModel`, and `findEdges`. Odds are obtained once per refresh with timeout/retry behavior, schema checked, normalized through team aliases, and retain all sportsbook lines. The top-level line is the lowest-hold book; edge generation correctly chooses the numerically best American price for each side. Implied probability formulas are correct for ordinary positive and negative moneylines. Edges are raw model probability minus one-book implied probability; there is no no-vig normalization, which is a model/business choice rather than a software defect.

Games, predictions, and odds are date-validated before model/edge generation. Started odds are preserved and invalid timestamps dropped. However, `YYYY-MM-DD|away|home` cannot distinguish a same-day doubleheader. Both odds deduplication and matching maps overwrite one entry, so odds/predictions can be crossed or lost. The canonical date uses UTC from provider timestamps while schedule freshness uses Eastern date; late-night/rescheduled edge cases require live fixture validation. There is also no explicit verification that a matched odds provider game ID corresponds to the MLB game ID (providers use different IDs), nor a nearest-start-time discriminator.

`predictGame` clamps finite inputs indirectly through typed helpers and its logistic result is within 0–1, with away probability complementary to home. Missing ratings default to 1500; missing pitcher/bullpen/offense inputs default to neutral component values. More importantly, prediction exceptions are logged and converted to `null`; the batch then publishes the remaining predictions as successful. Missing probable pitchers therefore do not stop prediction and may materially change estimates without a prominent output warning.

`findEdges` writes `mlb:edges:today` without an associated metadata key. Public cache APIs return arrays without date/freshness. The dashboard merges by match key and gracefully handles loading, empty, and error states, but cannot prove that edge/odds arrays belong to the predictions currently shown and does not display a strong stale-data warning.

### Historical/model integrity

Historical ingestion replaces each requested season key from MLB schedule finals, excludes spring and non-MLB opponents, and separates regular/postseason. The audit fixed rejection of the current `Athletics` name (only `Oakland Athletics` had been allowed). Records lack `gamePk`, so no identity-based duplicate check exists; full replacement limits accumulation, but duplicate provider rows and doubleheaders are indistinguishable in evaluation. Historical metadata describes only the most recently requested range; weekly refresh protects the separately retained ratings range.

Elo processing is chronological and uses completed games, avoiding obvious future-result leakage in rating construction. The code inspection establishes arithmetic/software behavior only, not calibration or profitability. Home-field 25 Elo, component weights/defaults, 3% edge threshold, raw-vig comparison, and park-factor methodology require model-owner approval and backtesting.

### Security and operations

Operational mutation routes require POST and a bearer/header/body secret; cron routes require the distinct cron secret. Middleware protects cached read APIs and pages with a short-lived HTTP-only cookie. No committed credential-looking values were found. Odds URLs are redacted and generic errors avoid returning internals.

Risks: the session token is an unsalted deterministic SHA-256 construction containing the shared password and timestamp rather than an HMAC with a dedicated session secret; a stolen cookie permits offline password guessing. Body-based admin secrets broaden accidental logging exposure. `buildPublicApiUrl` trusts forwarded protocol and Host for server-side self-fetching; platform host-header enforcement is relied on. Optional `BALLPARK_FACTORS_URL` is operator-controlled and fetched server-side, so it must never be user-controlled. The dormant production validator is authenticated, opt-in, and makes at most one provider request.

GitHub Actions handles DST by paired UTC triggers plus application/step Eastern gates. Workflow concurrency exists. Market jobs refresh stats first. There is no Vercel cron configuration in `vercel.json`, so there is no duplicate scheduler in this repository; external Vercel project cron settings remain unknown. `cancel-in-progress: true` can cancel an active Actions run, while Redis locks reduce overlap. GitHub scheduled events can be delayed, and the broad windows admit paired invocations; idempotency/locks are therefore essential and present, although forced market dependency refresh bypasses the daily marker.

## Redis inventory

All application values use Upstash `GET`/`SET` JSON semantics (Redis native string values serialized/deserialized by the client), except ephemeral counters/locks. No application hash/list/set commands were found, so the inspected code is internally consistent and should not itself create `WRONGTYPE`; pre-existing production keys of other native types still require inspection.

| Key/pattern | Writer | Readers | Native/data shape | Freshness / expiry | Conflict or risk |
|---|---|---|---|---|---|
| `mlb:games:today` | `fetchGames`, repair in `pipeline` | model, market precheck | string JSON array of canonical games | companion Eastern `dateKey`; no TTL | payload/meta non-atomic; stale data retained but rejected by model |
| `mlb:games:today:meta` | `fetchGames` | model, market, stats API | string JSON object | `dateKey`, `fetchedAt`, counts; no TTL | none by code |
| `mlb:ballparkFactors:current` | `fetchGames` | operational inspection | string JSON object | source only; no TTL | no explicit generated date |
| `mlb:stats:pitchers` + `:meta` | pitcher route | model/pitcher ratings, stats API | string JSON v3 `{byId,aliasMap}` + object | Eastern date, timestamp/count; no TTL | partial/low-count data can be marked fresh; two writes |
| `mlb:stats:bullpen` + `:meta` | bullpen route | model, stats API | string JSON team-object + object | Eastern date, timestamp/count; no TTL | incomplete/empty result can be marked fresh |
| `mlb:stats:offense` + `:meta` | offense route | model, stats API | string JSON team-object + object | Eastern date, timestamp/count; no TTL | failed teams can carry null/default fields as fresh |
| `mlb:odds:today` + `:meta` | odds route | edge model, dashboard/API | string JSON canonical odds array + object | Eastern date, fetched timestamp/count; no TTL | doubleheader overwrite; payload/meta separate |
| `mlb:ratings:teams` + `:meta` | build ratings | model, weekly verification | string JSON team→number + object | generated/data-through/season, max-age validation; no TTL | defaults silently fill absent team ratings |
| `mlb:ratings:historicalRange` | weekly route | weekly route | string JSON range config | `updatedAt`; no TTL | operational metadata distinct from freshness |
| `mlb:predictions:today` + `:meta` | model | edge generator, dashboard/API | string JSON prediction array + object | Eastern date + generated timestamp; no TTL | partial prediction batch can be published |
| `mlb:predictions:<date>` | model | evaluator | string JSON prediction array | date in key; no TTL/meta | unbounded history; UTC/Eastern legacy naming should be checked |
| `mlb:edges:today` | edge generator | dashboard/API | string JSON edge array | **no metadata/TTL** | stale/current association cannot be independently verified |
| `mlb:games:historical:<year>` | historical loader | ratings/evaluator | string JSON final-game array | year in key; no TTL | no game ID/dedup; full replacement |
| `mlb:games:historical:meta` | historical loader | ratings/weekly route | string JSON range/count | loaded timestamp; no TTL | narrow refresh overwrites range metadata |
| `mlb:evaluation:<date>` | evaluator | evaluation API | string JSON daily summary | date in key; no TTL | retained indefinitely |
| `mlb:cron:*:<date>` | orchestrators | same orchestrators | string JSON marker | Eastern date; 7-day TTL | forced runs intentionally bypass some markers |
| `mlb:lock:*` | guards/routes | guards/routes | string owner token | short TTL, NX | verify no legacy non-string types |
| `mlb:cooldown:*` | guards/routes | guards/routes | string marker | route-specific TTL | none |
| `mlb:limit:*` | rate limiter | rate limiter | integer string counter | window TTL | WRONGTYPE if legacy JSON occupies prefix |

The README mentions no `mlb:model:edges`, `mlb:ratings:pitchers`, or generic `mlb:ratings`; none are used by current code. Treat any such production keys as obsolete candidates only after a read-only inventory.

## Issues fixed

### Current Athletics name excluded from historical training

- **Root cause:** historical ingestion used a hard-coded MLB name allowlist containing `Oakland Athletics` but not `Athletics`, unlike the current-game eligibility module.
- **Impact:** current Athletics finals could be silently omitted from Elo history.
- **Fix:** accept both names and add a route regression fixture/assertion.
- **Validation:** targeted route test and full source test suite.

## Open problems, ranked

### HIGH — doubleheaders collide

Canonical match keys omit game number/time/game identity. Dedupe maps overwrite duplicates. Introduce a versioned identity strategy: match same normalized teams/date by nearest scheduled start with a bounded tolerance, retain provider IDs, and explicitly resolve doubleheaders; backfill/migrate today caches safely.

### HIGH — partial upstream failures publish fresh stats/predictions

Per-team/provider errors are tolerated, current metadata is still written, and prediction exceptions become omitted rows. Add minimum completeness and expected-team/game coverage checks, degraded status metadata, fail-before-publish semantics, and atomic/staged publication. Market execution should refuse degraded prerequisites unless an explicit policy allows them.

### MEDIUM — edge/dashboard freshness is not end-to-end

Edges lack metadata and public APIs/dashboard do not verify/display dates. Write edge metadata containing Eastern date plus source prediction/odds timestamps/counts; read all metadata together; reject or visibly label stale/mismatched views.

### MEDIUM — historical identity/deduplication is weak

Persist MLB `gamePk`, game type/status, and a stable game identity; deduplicate and test doubleheaders. Before schema rollout, decide compatibility with existing Elo/evaluation records.

### MEDIUM — authentication construction and host trust

Replace password-derived digest sessions with an HMAC/signed random-session design using a dedicated secret, use timing-safe comparison where available, prefer header-only operational tokens, and validate allowed origins/hosts for self-fetches.

### MEDIUM — no conclusive build or vulnerability audit in this environment

Restore dependencies from an accessible registry and run the CI-equivalent build/audit. The failed registry operations are environmental, not proof of defects.

### LOW — no lint/static-check configuration

Add ESLint (or another agreed checker) and a CI script. TypeScript is installed but the application is JavaScript and no `tsconfig.json` exists.

### LOW — indefinite cache/history retention

Today keys are protected by date checks in model paths but do not expire; dated predictions/evaluations grow without bounds. Define retention, TTLs, and archival requirements. Do not delete production keys without a reviewed migration.

## External integration matrix

| Integration | Call sites / expected shape | Env | Failure/retry/cache | Live status |
|---|---|---|---|---|
| MLB Stats API | schedule route; pitcher/offense/bullpen libs; historical loader. JSON `dates[].games`, `teams`, `stats[].splits`, `people` | none | shared timeout/retry for transient responses; some subrequests degrade silently; Redis cached | **LIVE VALIDATION REQUIRED** |
| Baseball Savant | pitcher/offense/bullpen CSV helpers | none | timeout/retry/parser fallback varies; blocks/partial metrics tolerated; merged into daily caches | **LIVE VALIDATION REQUIRED** |
| The Odds API | odds route via v4 MLB h2h endpoint; array of games/bookmakers/markets/outcomes | `ODDS_API_KEY` | timeout/retry including 429; 30s cooldown, rate limit, cache-first/selective refresh; paid quota risk | **LIVE VALIDATION REQUIRED** |
| Upstash Redis | all API/cache/guard modules | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | REST client errors surface; locks/TTL; application payloads have no TTL | **LIVE VALIDATION REQUIRED** |
| Vercel | Next deployment/middleware/serverless runtime; no repo cron entries | deployment env | platform-managed | **LIVE VALIDATION REQUIRED** |
| GitHub Actions | three workflows | GitHub `PIPELINE_BASE_URL`, `CRON_SECRET`, `ADMIN_API_SECRET`, optional `PIPELINE_AUTH_TOKEN` | curl failures fail jobs; market retries; concurrency configured | YAML/code reviewed only; **LIVE VALIDATION REQUIRED** |
| App auth | login/middleware/logout | `APP_PASSWORD` | local tests cover success/rejection/cookies; no external auth provider | local logic validated; deployed enforcement requires live check |
| Optional ballpark URL | server-side ballpark loader | `BALLPARK_FACTORS_URL` | bundled fallback | **LIVE VALIDATION REQUIRED** if configured |

Rate limits should be reviewed against current provider terms. Only the Odds API has explicit quota sensitivity in this design; avoid enabling the diagnostic repeatedly.

## Items requiring owner review

1. **Doubleheader identity contract.** Choose and approve a versioned match strategy and cache migration. Recommendation: canonical MLB game ID internally plus a provider-link record chosen by teams/date/nearest time. Doing nothing risks wrong bets on doubleheader days.
2. **Partial-data policy.** Decide required coverage (for example all scheduled teams and all known starters versus a documented degraded mode). Recommendation: fail publication when game/team coverage is incomplete and retain the last known-good payload with a degraded alert. Doing nothing permits confident-looking recommendations based on defaults.
3. **Model assumptions.** Approve 25 Elo home field, neutral fallbacks, component scales, park factors, raw-vig edge calculation, and strict `>3%` threshold using time-split backtests. Doing nothing preserves software behavior but leaves calibration/business risk unapproved.
4. **Scheduler ownership.** Confirm GitHub Actions is the sole scheduler and inspect Vercel project cron settings. Recommendation: one scheduler of record, with alerts. Doing nothing may allow externally configured duplicate runs.
5. **Redis migration/retention.** Inventory native types and legacy keys read-only; approve TTLs and game-identity migration. Recommendation: snapshot, migrate versioned keys, then delete obsolete keys only after rollback validation. Doing nothing leaves growth and legacy WRONGTYPE risk.
6. **Secrets and session design.** Rotate/separate admin, cron, app password, Redis, and Odds credentials; approve a dedicated session signing secret. Doing nothing retains offline-guessing and shared-secret exposure risk.
7. **Provider quota/cost.** Confirm Odds API plan and desired refresh cadence. Recommendation: preserve selective refresh and add quota-header telemetry without logging the key. Doing nothing may cause surprise exhaustion.
8. **Deployment settings.** Confirm Node 22, environment scoping, function timeouts, regions, logs/alerts, and protection of the production validator. Doing nothing leaves local/CI assumptions unverified.

## Live validation procedures

### Upstash Redis

- **Credentials:** staging `UPSTASH_REDIS_REST_URL` and token.
- **Test:** deploy with a disposable namespace/database; run the authenticated production validator once, then stats and market pipelines; read `TYPE`, values, metadata, and TTL for every inventory key; simulate a wrong native type only on a disposable key.
- **Success:** round-trip succeeds, all application values are strings/JSON, metadata dates/counts match payloads, locks expire, stale cache is rejected.
- **Cleanup:** delete only disposable validation keys/database; never run type mutation against production.

### MLB Stats API and Savant

- **Credentials:** none; use staging egress.
- **Test:** run one stats pipeline on a known regular-season day, one no-game day, a spring day, a doubleheader day, and fixtures with postponed/rescheduled games; compare counts/team IDs/pitchers to official responses and inspect degraded warnings.
- **Success:** only eligible MLB games persist; all expected teams/players have valid records; metadata/counts agree; provider errors do not publish misleading freshness.
- **Cleanup:** use isolated Redis or restore staging snapshot.

### The Odds API

- **Credentials:** a restricted staging `ODDS_API_KEY` with quota available.
- **Test:** enable production validator and call it once; disable it immediately. Then make one authenticated odds refresh and inspect response quota headers in provider console, normalized games, books, times, and doubleheader matching.
- **Success:** HTTP 200 array with MLB h2h outcomes; no secret appears in logs; quota decreases only as expected; current games match schedule unambiguously.
- **Cleanup:** disable `PRODUCTION_VALIDATION_ENABLED`; remove/rotate temporary key if used.

### Vercel/auth/dashboard

- **Credentials:** staging deployment access and app/admin/cron secrets.
- **Test:** verify unauthenticated page/read API redirect, invalid operational/cron 401, valid login cookie flags/expiry, logout, stale/empty/error dashboard states, and server logs. Inspect project cron settings.
- **Success:** no protected data or mutation is available anonymously; stale state is not represented as current; no duplicate cron exists.
- **Cleanup:** clear session and rotate temporary secrets.

### GitHub Actions

- **Credentials:** repository Actions access and configured secrets.
- **Test:** manually dispatch stats, market, and weekly jobs against staging; observe order, summaries, retries, locks, and concurrent-dispatch behavior. At the next DST boundary confirm only the matching paired UTC invocation performs work.
- **Success:** stats precede market, failures stop downstream publication, one effective execution per window, secrets redacted.
- **Cleanup:** remove staging secrets/environment after validation if temporary.

### Build/security audit

- **Credentials:** access to npm registry/advisory endpoint.
- **Test:** run `npm ci`, `npm test`, `npm run build`, `npm audit --omit=dev`, and `node scripts/verify-audit.mjs audit.json` exactly as CI does.
- **Success:** clean install, 179+ tests pass, production build succeeds, policy script evaluates a genuine audit response with no blocking finding.
- **Cleanup:** none.

## Recommended next tasks

### Release-blocking

1. **Doubleheader-safe joining:** “Introduce and test a versioned game/odds identity resolver that handles MLB doubleheaders, reschedules, postponements, provider IDs, and nearest commence times without overwriting records.”
2. **Fail-safe stats publication:** “Add coverage/quality gates and staged atomic publication for pitcher, bullpen, and offense caches; retain last-known-good data and expose degraded metadata on partial provider failures.”
3. **Prediction batch integrity:** “Make prediction failures explicit and prevent publishing a partial successful batch unless a reviewed degraded-mode policy is satisfied.”
4. **Fresh output contract:** “Add odds/prediction/edge lineage metadata and enforce/display current Eastern date and source timestamps in public APIs and dashboard.”
5. **Staging certification:** “Execute the documented live integration, cron, authentication, build, and dependency-audit procedures in staging and attach sanitized evidence.”

### Recommended

6. **Historical game identity migration:** “Persist `gamePk`, deduplicate historical finals, test postseason/doubleheaders, and implement a non-destructive versioned Redis migration with rollback.”
7. **Session hardening:** “Replace password-derived session hashes with signed sessions using a dedicated secret, timing-safe validation, and documented secret rotation.”
8. **CI static quality gate:** “Add ESLint for the JavaScript/Next.js codebase, an `npm run lint` script, and CI enforcement without broad style rewrites.”

### Optional enhancements

9. **Retention/observability:** “Define TTL/archive policy for today and dated keys; add pipeline completeness, age, provider quota, unmatched-game, and degraded-input alerts.”
10. **Provider fixture suite:** “Add sanitized contract fixtures for no-game, spring, doubleheader, postponed, rescheduled, missing-pitcher, malformed Savant CSV, and Odds API naming/time variants.”
