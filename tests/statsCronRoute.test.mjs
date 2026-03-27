import test from "node:test"
import assert from "node:assert/strict"

process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.test"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

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

function createRequest(overrides = {}) {
  const defaultHeaders = {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    "x-forwarded-for": "203.0.113.40"
  }

  return {
    method: "GET",
    query: {},
    headers: {
      ...defaultHeaders,
      ...(overrides.headers || {})
    },
    socket: {
      remoteAddress: "203.0.113.40"
    },
    ...overrides,
    headers: {
      ...defaultHeaders,
      ...(overrides.headers || {})
    }
  }
}

async function importRoute(modulePath) {
  const moduleUrl = new URL(`${modulePath}?t=${Date.now()}-${Math.random()}`, import.meta.url)
  const imported = await import(moduleUrl)
  return imported.default
}

async function withMockedDate(isoString, callback) {
  const RealDate = Date
  const fixedTime = new RealDate(isoString).getTime()

  class MockDate extends RealDate {
    constructor(value) {
      if (arguments.length === 0) {
        super(fixedTime)
        return
      }

      super(value)
    }

    static now() {
      return fixedTime
    }
  }

  global.Date = MockDate

  try {
    return await callback()
  } finally {
    global.Date = RealDate
  }
}

test("daily stats cron route skips requests outside the 5:30-8:30 AM Eastern window", { concurrency: false }, async () => {
  process.env.CRON_SECRET = "cron-secret"
  process.env.ADMIN_API_SECRET = "admin-secret"

  const handler = await importRoute("../pages/api/cron/runDailyStatsPipeline.js")
  const res = createMockResponse()

  await withMockedDate("2026-01-16T14:00:00.000Z", async () => {
    await handler(createRequest(), res)
  })

  assert.equal(res.statusCode, 202)
  assert.equal(res.body.skipped, true)
  assert.match(res.body.reason, /05:30-08:30 America\/New_York/)
})
