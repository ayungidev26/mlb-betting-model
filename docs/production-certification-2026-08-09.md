# Production certification — 2026-08-09

This report distinguishes executed evidence from source review. No staging, Redis,
Odds API, GitHub Actions, or Vercel credentials were present in this environment.
No production data or infrastructure configuration was changed.

## CONFIRMED PASS

- **Automated tests:** `npm test` completed with 187 passing and 0 failing tests.
- **Static analysis:** `npm run lint` completed with zero findings using the
  repository ESLint flat configuration.
- **Session signing:** sessions now contain a versioned issue time and an
  HMAC-SHA-256 signature made with the independent `SESSION_SIGNING_SECRET`.
  Validation uses a timing-safe comparison and rejects tampering, a different
  secret, future-issued tokens, and tokens at or beyond the five-minute expiry.
  Cookie tests confirm HTTP-only, SameSite=Lax, logout expiry, and production
  Secure behavior. Passwords are not embedded in session material.
- **Origin handling:** dashboard self-fetches use only `DEPLOYMENT_ORIGIN` and
  reject a request Host that differs from that configured origin. Forwarded
  protocol and arbitrary Host values can no longer select a fetch target.
- **CI configuration:** the production build workflow now runs tests, lint, and
  build after `npm ci`; the dependency workflow separately obtains and evaluates
  an npm audit document.
- **Audit-policy fail closed:** the repository policy rejects npm audit error or
  incomplete documents instead of reporting them as zero vulnerabilities.
- **Repository scheduler review:** GitHub Actions defines paired UTC triggers with
  `America/New_York` gates for DST, concurrency groups, stats-first market
  processing, and failure checks. The weekly workflow has its own concurrency
  group. `vercel.json` contains no repository-managed cron declaration.
- **Temporary Redis retention (source and mock validation):** locks, cooldowns,
  rate-limit counters, and cron markers already receive expirations. Tests cover
  lock ownership and expiration behavior. No destructive retention change was
  made.

## CONFIRMED FAILURE

- **None from application tests or lint.** The production build could not start
  because `npm ci` could not install dependencies in this environment; this is
  classified below rather than as an application build failure.

## BLOCKED BY ENVIRONMENT/CREDENTIALS

- **Install:** `npm ci` could not access the npm registry (HTTP 403 from the
  environment proxy) and was stopped after repeated retries. The working tree was
  cleaned of the partial `node_modules` directory.
- **Build:** `npm run build` could not find `next` because installation was
  blocked. This is not a successful production build and is not evidence of a
  source build defect.
- **Dependency advisory:** `npm audit --omit=dev --json` received HTTP 403 from
  the advisory endpoint. Severity counts are therefore **unknown**, not zero.
  The policy correctly rejected that failed audit response.
- **Redis:** no Upstash URL/token was available. Native `TYPE`, JSON shape, TTL,
  read/write/cleanup, legacy `WRONGTYPE`, and no-TTL inventory were not inspected
  against staging or production.
- **MLB Stats API and Baseball Savant:** outbound provider certification could not
  be completed through the environment proxy. Regular slate, no-game, spring,
  doubleheader, postponement/reschedule, and changed-pitcher cases remain live
  certification work.
- **Odds API:** no restricted staging key was available. Authentication, live h2h
  shape, provider IDs/times, doubleheaders, quota headers, and redaction in
  deployed logs were not exercised.
- **Authentication/deployment:** no staging origin or credentials were available.
  Anonymous redirects/API rejection, invalid admin/cron credentials, login,
  cookie attributes, expiry, logout, and degraded dashboard behavior were tested
  locally, but not certified against a deployment.
- **GitHub Actions and Vercel:** no platform access was available to dispatch
  workflows, inspect secrets/log redaction, or inspect Vercel project-level cron.
  Repository configuration review is not a live validation.

## OWNER DECISION REQUIRED

- Confirm GitHub Actions as the sole scheduler of record and disable any Vercel
  project-level/external duplicate only after it is inventoried.
- Approve a retention/archive policy before changing persistent keys. Recommended:
  locks/counters/cooldowns retain their short operational TTLs; today's schedule
  and odds 2–3 days; current stats/metadata 2–7 days; today predictions/edges
  7 days; dated predictions/evaluations per an approved 1–2 year analytics policy;
  historical games and ratings remain durable/versioned. Snapshot first and use
  versioned keys plus a rollback window for native-type conflicts.
- Approve credential generation/rotation and deployment scoping. The session
  secret must be independently generated (at least 32 random bytes), must not be
  reused, and changing it intentionally invalidates existing sessions.

## Production-readiness matrix

| Area | Status | Evidence | Release Blocking? |
| --- | --- | --- | --- |
| Tests | CONFIRMED PASS | 187 passed, 0 failed locally | No |
| Lint | CONFIRMED PASS | ESLint completed with zero findings | No |
| Production build | BLOCKED BY ENVIRONMENT | Dependencies unavailable; build not executed | **Yes** |
| Dependency audit | BLOCKED BY ENVIRONMENT | Advisory endpoint HTTP 403; counts unknown; policy failed closed | **Yes** |
| Redis | BLOCKED BY CREDENTIALS | No live native-type/TTL inventory or staging round trip | **Yes** |
| MLB Stats API | BLOCKED BY ENVIRONMENT | No live fixture certification | **Yes** |
| Baseball Savant | BLOCKED BY ENVIRONMENT | No live fixture certification | **Yes** |
| Odds API | BLOCKED BY CREDENTIALS | No paid endpoint request was made | **Yes** |
| Authentication | CONFIRMED PASS (local) / BLOCKED (staging) | Route/helper tests pass; deployment not exercised | **Yes** |
| Session signing | CONFIRMED PASS | HMAC and negative/expiry/cookie tests | No |
| GitHub Actions | CONFIRMED PASS (source) / BLOCKED (live) | Workflow review only; no dispatch | **Yes** |
| Vercel/deployment | BLOCKED BY CREDENTIALS | Repo has no Vercel cron; project settings unavailable | **Yes** |
| Scheduler ownership | OWNER DECISION REQUIRED | GitHub schedule exists; external scheduler inventory unavailable | **Yes** |
| Dashboard freshness | CONFIRMED PASS (local) / BLOCKED (staging) | stale/degraded/lineage tests; no deployed exercise | **Yes** |
| Secrets/configuration | OWNER DECISION REQUIRED | new variables documented; deployed values/scopes unavailable | **Yes** |

## Remaining release-blocking items

1. Run the exact clean install/test/lint/build/audit/policy sequence from a runner
   with npm registry and advisory access; require every command to pass and record
   genuine audit severity counts.
2. Provide isolated staging credentials and execute the Redis, Odds API,
   authentication/deployment, GitHub Actions, and Vercel checks above, retaining
   sanitized evidence and cleaning only disposable validation keys.
3. Execute the representative MLB Stats API/Baseball Savant live-date fixture
   certification and reconcile persisted counts/statuses to provider responses.
4. Confirm one scheduler of record and verify that no duplicate Vercel/external
   schedule is active.

NEEDS ATTENTION
