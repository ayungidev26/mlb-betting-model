import test from "node:test"
import assert from "node:assert/strict"

import { buildPublicPageError, sendRouteError } from "../lib/apiErrors.js"

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

test("sendRouteError hides internal details for unknown server errors", () => {
  const res = createMockResponse()

  sendRouteError(res, "fetchOdds", new Error("ODDS_API_KEY environment variable is required"))

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, {
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR"
  })
})

test("sendRouteError normalizes missing upstream data failures", () => {
  const res = createMockResponse()

  sendRouteError(res, "runModel", new Error("Team ratings not found"))

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, {
    error: "Upstream data unavailable",
    code: "UPSTREAM_DATA_UNAVAILABLE"
  })
})

test("sendRouteError makes stale ratings failures actionable without exposing internals", () => {
  const res = createMockResponse()

  sendRouteError(
    res,
    "runModel",
    new Error("Team ratings stale: historical results are more than 8 days behind. Run /api/loadHistorical, then /api/buildRatings.")
  )

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, {
    error: "Team ratings must be refreshed before model execution",
    code: "RATINGS_REFRESH_REQUIRED"
  })
})

test("sendRouteError identifies invalid dated model caches", () => {
  const statsRes = createMockResponse()
  const gamesRes = createMockResponse()

  sendRouteError(statsRes, "runModel", new Error("mlb:stats:pitchers:meta cache stale (private details). Refresh the upstream cache."))
  sendRouteError(gamesRes, "runModel", new Error("Games metadata/payload record count disagreement. Refresh the upstream cache."))

  assert.deepEqual(statsRes.body, {
    error: "Stats cache must be refreshed before model execution",
    code: "STATS_CACHE_INVALID"
  })
  assert.deepEqual(gamesRes.body, {
    error: "Games cache must be refreshed before model execution",
    code: "GAMES_CACHE_INVALID"
  })
})

test("sendRouteError identifies an invalid odds cache", () => {
  const res = createMockResponse()

  sendRouteError(
    res,
    "findEdges",
    new Error("Odds cache is degraded. Refresh the upstream cache.")
  )

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, {
    error: "Odds cache must be refreshed before edge generation",
    code: "ODDS_CACHE_INVALID"
  })
})

test("sendRouteError exposes safe prediction batch diagnostics", () => {
  const res = createMockResponse()
  const error = new Error("Prediction batch rejected: internal detail")
  error.code = "INCOMPLETE_PREDICTION_BATCH"
  error.diagnostics = {
    eligibleGames: 15,
    predictionsSucceeded: 14,
    predictionsFailed: 1,
    failedGameIds: [777],
    failures: [{ gameId: 777, message: "sensitive implementation detail" }]
  }

  sendRouteError(res, "runModel", error)

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, {
    error: "One or more game predictions could not be generated",
    code: "INCOMPLETE_PREDICTION_BATCH",
    details: {
      eligibleGames: 15,
      predictionsSucceeded: 14,
      predictionsFailed: 1,
      failedGameIds: [777]
    }
  })
  assert.equal(JSON.stringify(res.body).includes("sensitive"), false)
})

test("buildPublicPageError returns a generic page-safe message", () => {
  const errorMessage = buildPublicPageError(
    "homePageProps",
    new Error("redis unavailable"),
    "Cached predictions are currently unavailable."
  )

  assert.equal(errorMessage, "Cached predictions are currently unavailable.")
})
