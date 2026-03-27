import test from "node:test"
import assert from "node:assert/strict"

process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.test"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

const { redis } = await import("../lib/upstash.js")
const { default: statsHandler } = await import("../pages/api/stats.js")

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

test("stats route only allows GET", async () => {
  const res = createMockResponse()

  await statsHandler({ method: "POST" }, res)

  assert.equal(res.statusCode, 405)
  assert.deepEqual(res.headers.Allow, ["GET"])
})

test("stats route returns cached sections and metadata", async () => {
  const originalGet = redis.get

  redis.get = async (key) => {
    switch (key) {
      case "mlb:stats:pitchers":
        return {
          "Pitcher A": {
            era: 3.5,
            whip: 1.1
          }
        }
      case "mlb:stats:pitchers:meta":
        return {
          lastUpdatedAt: "2026-03-27T10:00:00.000Z",
          records: 1
        }
      case "mlb:stats:bullpen":
        return {
          "Team A": {
            era: 3.9
          },
          "Team B": {
            era: 4.2
          }
        }
      case "mlb:stats:bullpen:meta":
        return {
          lastUpdatedAt: "2026-03-27T10:05:00.000Z",
          records: 2
        }
      case "mlb:stats:offense":
        return null
      case "mlb:stats:offense:meta":
        return null
      default:
        return null
    }
  }

  try {
    const res = createMockResponse()

    await statsHandler({ method: "GET" }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.sections.pitchers.recordCount, 1)
    assert.equal(res.body.sections.bullpen.recordCount, 2)
    assert.equal(res.body.sections.offense.recordCount, 0)
    assert.equal(res.body.sections.offense.available, false)
    assert.equal(res.body.summary.availableSections, 2)
  } finally {
    redis.get = originalGet
  }
})
