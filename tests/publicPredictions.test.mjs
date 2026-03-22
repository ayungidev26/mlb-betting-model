import test from "node:test"
import assert from "node:assert/strict"

process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.test"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

const { redis } = await import("../lib/upstash.js")

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    }
  }
}

function createMockRedis(predictions) {
  return {
    async get(key) {
      assert.equal(key, "mlb:predictions:today")
      return predictions
    }
  }
}

async function importRoute() {
  const moduleUrl = new URL(`../pages/api/predictions.js?t=${Date.now()}-${Math.random()}`, import.meta.url)
  const imported = await import(moduleUrl)
  return imported.default
}

async function withPatchedRedis(mockRedis, callback) {
  const originalGet = redis.get
  redis.get = mockRedis.get

  try {
    return await callback()
  } finally {
    redis.get = originalGet
  }
}

test("predictions route returns cached predictions for public reads", async () => {
  const handler = await importRoute()
  const res = createMockResponse()

  await withPatchedRedis(createMockRedis([
    {
      gameId: "game-1",
      awayTeam: "Los Angeles Dodgers",
      homeTeam: "Oakland Athletics",
      homeWinProbability: 0.41,
      awayWinProbability: 0.59
    }
  ]), async () => {
    await handler({ method: "GET", headers: {} }, res)
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.predictions.length, 1)
  assert.deepEqual(res.body.summary, {
    predictionsCreated: 1,
    message: "Showing cached predictions."
  })
})

test("predictions route rejects non-GET methods", async () => {
  const handler = await importRoute()
  const res = createMockResponse()

  await handler({ method: "POST", headers: {} }, res)

  assert.equal(res.statusCode, 405)
  assert.deepEqual(res.headers.Allow, ["GET"])
  assert.deepEqual(res.body, {
    error: "Method POST Not Allowed"
  })
})
