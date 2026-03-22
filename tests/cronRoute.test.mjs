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

function createMockRedis(initialEntries = []) {
  const store = new Map(initialEntries)
  const expiry = new Map()

  function isExpired(key) {
    const expiresAt = expiry.get(key)

    if (expiresAt && expiresAt <= Date.now()) {
      store.delete(key)
      expiry.delete(key)
      return true
    }

    return false
  }

  return {
    async get(key) {
      if (isExpired(key)) {
        return null
      }

      return store.has(key) ? store.get(key) : null
    },
    async set(key, value, options = null) {
      if (options?.nx && store.has(key) && !isExpired(key)) {
        return null
      }

      store.set(key, value)

      if (typeof options?.ex === "number") {
        expiry.set(key, Date.now() + (options.ex * 1000))
      } else {
        expiry.delete(key)
      }

      return "OK"
    },
    async del(key) {
      const existed = store.delete(key)
      expiry.delete(key)
      return existed ? 1 : 0
    },
    async incr(key) {
      if (isExpired(key)) {
        store.delete(key)
      }

      const next = Number(store.get(key) || 0) + 1
      store.set(key, next)
      return next
    },
    async expire(key, seconds) {
      expiry.set(key, Date.now() + (seconds * 1000))
      return 1
    },
    async ttl(key) {
      if (isExpired(key) || !store.has(key)) {
        return -2
      }

      const expiresAt = expiry.get(key)

      if (!expiresAt) {
        return -1
      }

      return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    },
    snapshot(key) {
      return store.get(key)
    }
  }
}

async function importRoute(modulePath) {
  const moduleUrl = new URL(`${modulePath}?t=${Date.now()}-${Math.random()}`, import.meta.url)
  const imported = await import(moduleUrl)
  return imported.default
}

async function withPatchedRedis(mockRedis, callback) {
  const originalMethods = {
    get: redis.get,
    set: redis.set,
    del: redis.del,
    incr: redis.incr,
    expire: redis.expire,
    ttl: redis.ttl
  }

  Object.assign(redis, mockRedis)

  try {
    return await callback()
  } finally {
    Object.assign(redis, originalMethods)
  }
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

async function withMockedFetch(implementation, callback) {
  const originalFetch = global.fetch
  global.fetch = implementation

  try {
    return await callback()
  } finally {
    global.fetch = originalFetch
  }
}

function createJsonResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") {
          return "application/json"
        }

        return null
      }
    },
    async json() {
      return body
    }
  }
}


function createTextResponse({ ok = true, status = 200, body = "" } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "content-type") {
          return "text/csv; charset=utf-8"
        }

        return null
      }
    },
    async text() {
      return body
    }
  }
}

test("cron route skips requests outside the 10 AM Eastern execution window", { concurrency: false }, async () => {
  process.env.CRON_SECRET = "cron-secret"
  process.env.ADMIN_API_SECRET = "admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/cron/runDailyPipeline.js")

  await withPatchedRedis(createMockRedis(), async () => withMockedDate("2026-01-15T14:00:00.000Z", async () => {
    const res = createMockResponse()
    await handler(createRequest(), res)

    assert.equal(res.statusCode, 202)
    assert.equal(res.body.skipped, true)
    assert.match(res.body.reason, /10:00 America\/New_York/)
  }))
})

test("cron route runs the existing pipeline once per Eastern day and skips duplicates", { concurrency: false }, async () => {
  process.env.CRON_SECRET = "cron-secret"
  process.env.ADMIN_API_SECRET = "admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/cron/runDailyPipeline.js")
  const redisMock = createMockRedis([
    ["mlb:ratings:teams", {
      Yankees: 1500,
      RedSox: 1480
    }]
  ])

  await withPatchedRedis(redisMock, async () => withMockedDate("2026-07-01T14:00:00.000Z", async () => withMockedFetch(
    async (url) => {
      const target = String(url)

      if (target.includes("/schedule?")) {
        return createJsonResponse({
          body: {
            dates: [
              {
                date: "2026-07-01",
                games: [
                  {
                    gamePk: 123,
                    gameDate: "2026-07-01T23:05:00Z",
                    gameType: "R",
                    status: { detailedState: "Scheduled" },
                    teams: {
                      away: {
                        team: { name: "Boston Red Sox" },
                        probablePitcher: { id: 1, fullName: "Away Pitcher" }
                      },
                      home: {
                        team: { name: "New York Yankees" },
                        probablePitcher: { id: 2, fullName: "Home Pitcher" }
                      }
                    },
                    venue: { name: "Yankee Stadium" }
                  }
                ]
              }
            ]
          }
        })
      }

      if (target.includes("api.the-odds-api.com")) {
        return createJsonResponse({
          body: [
            {
              id: "odds-game-1",
              commence_time: "2026-07-01T23:05:00Z",
              home_team: "New York Yankees",
              away_team: "Boston Red Sox",
              bookmakers: [
                {
                  key: "draftkings",
                  title: "DraftKings",
                  last_update: "2026-07-01T13:55:00Z",
                  markets: [
                    {
                      key: "h2h",
                      outcomes: [
                        { name: "New York Yankees", price: -120 },
                        { name: "Boston Red Sox", price: 110 }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
      }

      if (target.includes("/people/search?names=Away%20Pitcher")) {
        return createJsonResponse({
          body: {
            people: [{ id: 1, fullName: "Away Pitcher" }]
          }
        })
      }

      if (target.includes("/people/search?names=Home%20Pitcher")) {
        return createJsonResponse({
          body: {
            people: [{ id: 2, fullName: "Home Pitcher" }]
          }
        })
      }

      if (target.includes("/people/1/stats")) {
        return createJsonResponse({
          body: {
            stats: [
              {
                splits: [
                  {
                    stat: {
                      era: "3.40",
                      whip: "1.12",
                      strikeOuts: 110,
                      inningsPitched: "95.1",
                      avg: ".229",
                      slg: ".377",
                      homeRuns: "10",
                      baseOnBalls: "28",
                      hitBatsmen: "3",
                      flyOuts: "70"
                    }
                  }
                ]
              }
            ]
          }
        })
      }

      if (target.includes("/people/2/stats")) {
        return createJsonResponse({
          body: {
            stats: [
              {
                splits: [
                  {
                    stat: {
                      era: "3.10",
                      whip: "1.05",
                      strikeOuts: 120,
                      inningsPitched: "101.0",
                      avg: ".218",
                      slg: ".341",
                      homeRuns: "9",
                      baseOnBalls: "24",
                      hitBatsmen: "2",
                      flyOuts: "82"
                    }
                  }
                ]
              }
            ]
          }
        })
      }


      if (target.includes("/api/v1/teams?sportId=1")) {
        return createJsonResponse({
          body: {
            teams: [
              { id: 147, name: "New York Yankees" },
              { id: 111, name: "Boston Red Sox" }
            ]
          }
        })
      }

      if (target.includes("/api/v1/teams/147/stats?stats=season&group=pitching")) {
        return createJsonResponse({
          body: {
            stats: [
              {
                splits: [
                  {
                    stat: {
                      era: "3.50",
                      whip: "1.20",
                      earnedRuns: "100",
                      inningsPitched: "257.1",
                      homeRuns: "30",
                      baseOnBalls: "80",
                      hitBatsmen: "8",
                      strikeOuts: "280",
                      flyOuts: "210"
                    }
                  }
                ]
              }
            ]
          }
        })
      }

      if (target.includes("/api/v1/teams/111/stats?stats=season&group=pitching")) {
        return createJsonResponse({
          body: {
            stats: [
              {
                splits: [
                  {
                    stat: {
                      era: "3.80",
                      whip: "1.25",
                      earnedRuns: "104",
                      inningsPitched: "246.0",
                      homeRuns: "32",
                      baseOnBalls: "84",
                      hitBatsmen: "7",
                      strikeOuts: "255",
                      flyOuts: "205"
                    }
                  }
                ]
              }
            ]
          }
        })
      }

      if (target.includes("baseballsavant.mlb.com/leaderboard/custom")) {
        return createTextResponse({
          body: [
            'player_id,pitcher,k_percent,bb_percent,xba,xslg,xera,hard_hit_percent,barrel_batted_rate,exit_velocity_avg',
            '1,Away Pitcher,28.4,7.1,0.221,0.351,3.12,34.5,7.8,88.6',
            '2,Home Pitcher,31.2,5.4,0.205,0.332,2.98,31.1,6.2,87.4'
          ].join("\n")
        })
      }

      return createJsonResponse({ body: {} })
    },
    async () => {
      const firstRun = createMockResponse()
      await handler(createRequest(), firstRun)

      assert.equal(firstRun.statusCode, 200)
      assert.equal(firstRun.body.ok, true)
      assert.equal(firstRun.body.pipeline.ok, true)
      assert.equal(firstRun.body.pipeline.completedSteps, 6)

      const secondRun = createMockResponse()
      await handler(createRequest(), secondRun)

      assert.equal(secondRun.statusCode, 200)
      assert.equal(secondRun.body.skipped, true)
      assert.match(secondRun.body.reason, /already triggered/)
      assert.ok(redisMock.snapshot("mlb:cron:dailyPipeline:2026-07-01"))
    }
  )))
})

test("cron route supports secure manual force runs", { concurrency: false }, async () => {
  process.env.CRON_SECRET = "cron-secret"
  process.env.ADMIN_API_SECRET = "admin-secret"

  const handler = await importRoute("../pages/api/cron/runDailyPipeline.js")

  await withPatchedRedis(createMockRedis(), async () => withMockedDate("2026-01-15T14:00:00.000Z", async () => withMockedFetch(
    async () => createJsonResponse({ ok: false, status: 500, body: {} }),
    async () => {
      const res = createMockResponse()
      await handler(createRequest({ query: { force: "true" } }), res)

      assert.notEqual(res.statusCode, 202)
      assert.equal(res.body.trigger, "manual")
      assert.equal(typeof res.body.ok, "boolean")
    }
  )))
})
