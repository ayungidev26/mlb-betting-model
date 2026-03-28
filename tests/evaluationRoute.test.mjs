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

function createMockRedis(entries = []) {
  const store = new Map(entries)

  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null
    }
  }
}

async function importRoute(path) {
  const moduleUrl = new URL(`../pages/api/${path}.js?t=${Date.now()}-${Math.random()}`, import.meta.url)
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

function shiftIsoDate(dateString, dayDelta) {
  const shifted = new Date(`${dateString}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + dayDelta)
  return shifted.toISOString().slice(0, 10)
}

test("evaluation route uses default limit window and returns ascending records", async () => {
  const handler = await importRoute("evaluation")
  const res = createMockResponse()
  const today = new Date().toISOString().slice(0, 10)

  await withPatchedRedis(createMockRedis([
    [`mlb:evaluation:${shiftIsoDate(today, -2)}`, { date: shiftIsoDate(today, -2), metrics: { gamesPredicted: 1 } }],
    [`mlb:evaluation:${today}`, { date: today, metrics: { gamesPredicted: 2 } }]
  ]), async () => {
    await handler({ method: "GET", query: {}, headers: {} }, res)
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.metadata.dateRangeApplied.limit, 30)
  assert.equal(res.body.evaluations.length, 2)
  assert.deepEqual(
    res.body.evaluations.map((entry) => entry.date),
    [shiftIsoDate(today, -2), today]
  )
  assert.equal(res.body.metadata.returnedDays, 2)
})

test("evaluation route supports explicit date range", async () => {
  const handler = await importRoute("evaluation")
  const res = createMockResponse()

  await withPatchedRedis(createMockRedis([
    ["mlb:evaluation:2025-04-10", { date: "2025-04-10", metrics: { gamesPredicted: 4 } }],
    ["mlb:evaluation:2025-04-11", { date: "2025-04-11", metrics: { gamesPredicted: 5 } }]
  ]), async () => {
    await handler({
      method: "GET",
      query: {
        dateFrom: "2025-04-10",
        dateTo: "2025-04-11"
      },
      headers: {}
    }, res)
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.metadata.dateRangeApplied, {
    dateFrom: "2025-04-10",
    dateTo: "2025-04-11",
    limit: 30
  })
  assert.deepEqual(res.body.evaluations.map((entry) => entry.date), [
    "2025-04-10",
    "2025-04-11"
  ])
})

test("evaluation route returns empty list when no summaries are found", async () => {
  const handler = await importRoute("evaluation")
  const res = createMockResponse()

  await withPatchedRedis(createMockRedis(), async () => {
    await handler({
      method: "GET",
      query: {
        dateFrom: "2025-04-01",
        dateTo: "2025-04-03",
        limit: "2"
      },
      headers: {}
    }, res)
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.evaluations, [])
  assert.equal(res.body.metadata.returnedDays, 0)
  assert.deepEqual(res.body.metadata.dateRangeApplied, {
    dateFrom: "2025-04-02",
    dateTo: "2025-04-03",
    limit: 2
  })
})
