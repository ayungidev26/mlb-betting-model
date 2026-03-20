import test from "node:test"
import assert from "node:assert/strict"

import { fetchJsonWithRetry } from "../lib/upstreamFetch.js"

function createResponse({ ok = true, status = 200, contentType = "application/json", jsonValue = {}, retryAfter = null, jsonImpl } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        const normalized = name.toLowerCase()

        if (normalized === "content-type") {
          return contentType
        }

        if (normalized === "retry-after") {
          return retryAfter
        }

        return null
      }
    },
    json: jsonImpl || (async () => jsonValue)
  }
}

test("fetchJsonWithRetry returns parsed JSON for successful responses", async () => {
  const payload = { games: 3 }

  const data = await fetchJsonWithRetry("https://example.com/feed", {
    retries: 0,
    fetchImpl: async () => createResponse({ jsonValue: payload })
  })

  assert.deepEqual(data, payload)
})

test("fetchJsonWithRetry does not parse non-ok responses and retries transient failures", async () => {
  let attempts = 0
  let parsedErrorBody = false

  const data = await fetchJsonWithRetry("https://example.com/feed", {
    fetchImpl: async () => {
      attempts += 1

      if (attempts === 1) {
        return createResponse({
          ok: false,
          status: 503,
          retryAfter: "0",
          jsonImpl: async () => {
            parsedErrorBody = true
            return { message: "temporary outage" }
          }
        })
      }

      return createResponse({ jsonValue: { recovered: true } })
    }
  })

  assert.equal(attempts, 2)
  assert.equal(parsedErrorBody, false)
  assert.deepEqual(data, { recovered: true })
})

test("fetchJsonWithRetry rejects non-JSON upstream responses", async () => {
  await assert.rejects(
    fetchJsonWithRetry("https://example.com/feed", {
      retries: 0,
      fetchImpl: async () => createResponse({
        contentType: "text/html",
        jsonValue: { invalid: true }
      })
    }),
    /not JSON/
  )
})

test("fetchJsonWithRetry aborts requests that exceed the timeout", async () => {
  let abortObserved = false

  await assert.rejects(
    fetchJsonWithRetry("https://example.com/feed", {
      timeoutMs: 5,
      retries: 0,
      fetchImpl: async (_url, options) => new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          abortObserved = true
          const error = new Error("Timed out")
          error.name = "AbortError"
          reject(error)
        })
      })
    }),
    error => error?.name === "AbortError"
  )

  assert.equal(abortObserved, true)
})
