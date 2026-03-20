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

test("buildPublicPageError returns a generic page-safe message", () => {
  const errorMessage = buildPublicPageError(
    "homePageProps",
    new Error("redis unavailable"),
    "Cached predictions are currently unavailable."
  )

  assert.equal(errorMessage, "Cached predictions are currently unavailable.")
})
