import test from "node:test"
import assert from "node:assert/strict"

process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.test"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

const { redis } = await import("../lib/upstash.js")


const ROUTE_CASES = [
  ["buildRatings", "../pages/api/buildRatings.js"],
  ["fetchBullpenStats", "../pages/api/fetchBullpenStats.js"],
  ["fetchGames", "../pages/api/fetchGames.js"],
  ["fetchOdds", "../pages/api/fetchOdds.js"],
  ["fetchPitcherStats", "../pages/api/fetchPitcherStats.js"],
  ["fetchTeamOffenseStats", "../pages/api/fetchTeamOffenseStats.js"],
  ["findEdges", "../pages/api/findEdges.js"],
  ["loadHistorical", "../pages/api/loadHistorical.js"],
  ["runModel", "../pages/api/runModel.js"],
  ["runPipeline", "../pages/api/runPipeline.js"]
]

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
    "x-forwarded-for": "203.0.113.40"
  }

  if (overrides.includeAuthorization !== false) {
    defaultHeaders.authorization = `Bearer ${process.env.ADMIN_API_SECRET}`
  }

  return {
    method: "POST",
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

function createJsonResponse({ ok = true, status = 200, body = {}, retryAfter = null } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        const normalized = name.toLowerCase()

        if (normalized === "content-type") {
          return "application/json"
        }

        if (normalized === "retry-after") {
          return retryAfter
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

  Object.assign(redis, {
    get: mockRedis.get,
    set: mockRedis.set,
    del: mockRedis.del,
    incr: mockRedis.incr,
    expire: mockRedis.expire,
    ttl: mockRedis.ttl
  })

  try {
    return await callback()
  } finally {
    Object.assign(redis, originalMethods)
  }
}

async function withMockedFetch(fetchImpl, callback) {
  const originalFetch = global.fetch
  global.fetch = fetchImpl

  try {
    return await callback()
  } finally {
    global.fetch = originalFetch
  }
}

function withSilencedConsole(callback) {
  const originalError = console.error
  console.error = () => {}

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      console.error = originalError
    })
}

for (const [routeName, routePath] of ROUTE_CASES) {
  test(`${routeName} rejects missing authorization`, { concurrency: false }, async () => {
    process.env.ADMIN_API_SECRET = "test-admin-secret"
    process.env.ODDS_API_KEY = "test-odds-key"

    const handler = await importRoute(routePath)
    const req = createRequest({ includeAuthorization: false })
    const res = createMockResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.body, {
      error: "Missing Authorization header"
    })
  })

  test(`${routeName} rejects invalid authorization`, { concurrency: false }, async () => {
    process.env.ADMIN_API_SECRET = "test-admin-secret"
    process.env.ODDS_API_KEY = "test-odds-key"

    const handler = await importRoute(routePath)
    const req = createRequest({
      headers: {
        authorization: "Bearer wrong-secret"
      }
    })
    const res = createMockResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, {
      error: "Invalid bearer token"
    })
  })

  test(`${routeName} rejects non-POST methods`, { concurrency: false }, async () => {
    process.env.ADMIN_API_SECRET = "test-admin-secret"
    process.env.ODDS_API_KEY = "test-odds-key"

    const handler = await importRoute(routePath)
    const req = createRequest({ method: "GET" })
    const res = createMockResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 405)
    assert.deepEqual(res.headers.Allow, ["POST"])
    assert.deepEqual(res.body, {
      error: "Method GET Not Allowed"
    })
  })
}

test("fetchOdds returns a redacted response when upstream responds with 401", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchOdds.js")
  const redisMock = createMockRedis()

  await withSilencedConsole(async () => withPatchedRedis(redisMock, async () => withMockedFetch(
    async () => createJsonResponse({
      ok: false,
      status: 401,
      body: {
        message: "upstream auth failed"
      }
    }),
    async () => {
      const req = createRequest({ query: { refresh: "true" } })
      const res = createMockResponse()

      await handler(req, res)

      assert.equal(res.statusCode, 500)
      assert.deepEqual(res.body, {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR"
      })
      assert.equal(JSON.stringify(res.body).includes("401"), false)
      assert.equal(JSON.stringify(res.body).includes("auth failed"), false)
    }
  )))
})

test("fetchOdds returns a redacted response when upstream exhausts retries on 429", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchOdds.js")
  const redisMock = createMockRedis()
  let attempts = 0

  await withSilencedConsole(async () => withPatchedRedis(redisMock, async () => withMockedFetch(
    async () => {
      attempts += 1
      return createJsonResponse({
        ok: false,
        status: 429,
        retryAfter: "0",
        body: {
          message: "slow down"
        }
      })
    },
    async () => {
      const req = createRequest({ query: { refresh: "true" } })
      const res = createMockResponse()

      await handler(req, res)

      assert.equal(attempts, 3)
      assert.equal(res.statusCode, 500)
      assert.deepEqual(res.body, {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR"
      })
    }
  )))
})

test("fetchOdds returns a redacted response when upstream responds with 500", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchOdds.js")
  const redisMock = createMockRedis()

  await withSilencedConsole(async () => withPatchedRedis(redisMock, async () => withMockedFetch(
    async () => createJsonResponse({
      ok: false,
      status: 500,
      body: {
        message: "server exploded"
      }
    }),
    async () => {
      const req = createRequest({ query: { refresh: "true" } })
      const res = createMockResponse()

      await handler(req, res)

      assert.equal(res.statusCode, 500)
      assert.deepEqual(res.body, {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR"
      })
      assert.equal(JSON.stringify(res.body).includes("server exploded"), false)
    }
  )))
})

test("fetchOdds rejects requests while the route cooldown is active", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchOdds.js")
  const redisMock = createMockRedis([
    ["mlb:cooldown:fetchOdds", {
      lastTriggeredAt: Date.now() - 1000,
      nextAllowedAt: Date.now() + 30_000
    }]
  ])

  await withPatchedRedis(redisMock, async () => {
    const req = createRequest({ query: { refresh: "true" } })
    const res = createMockResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 429)
    assert.equal(res.body.code, "COOLDOWN_ACTIVE")
    assert.equal(res.headers["Retry-After"], "30")
  })
})

test("fetchBullpenStats blocks concurrent executions with a job lock", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchBullpenStats.js")
  const redisMock = createMockRedis()

  await withPatchedRedis(redisMock, async () => {
    await redisMock.set("mlb:lock:fetchBullpenStats", "existing-owner", { ex: 180 })

    const req = createRequest()
    const res = createMockResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.body, {
      error: "fetchBullpenStats is already running",
      code: "JOB_ALREADY_RUNNING",
      retryAfterSeconds: 180
    })
    assert.equal(res.headers["Retry-After"], "180")
  })
})

test("fetchPitcherStats enforces the per-IP rate limit", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchPitcherStats.js")
  const redisMock = createMockRedis([
    ["mlb:games:today", []]
  ])

  await withPatchedRedis(redisMock, async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const res = createMockResponse()
      await handler(createRequest(), res)
      assert.equal(res.statusCode, 200, `attempt ${attempt} should be allowed`)
    }

    const throttledRes = createMockResponse()
    await handler(createRequest(), throttledRes)

    assert.equal(throttledRes.statusCode, 429)
    assert.deepEqual(throttledRes.body, {
      error: "fetchPitcherStats rate limit exceeded",
      code: "RATE_LIMITED",
      retryAfterSeconds: 60
    })
    assert.equal(throttledRes.headers["Retry-After"], "60")
  })
})

test("fetchTeamOffenseStats stores season, split, recent, and expected offense metrics", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchTeamOffenseStats.js")
  const redisMock = createMockRedis()

  await withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      const target = String(url)

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

      if (target.includes("baseballsavant.mlb.com/leaderboard/custom")) {
        return createTextResponse({
          body: [
            'team_id,team,pa,woba,xwoba,xba,xslg,hard_hit_percent,barrel_batted_rate',
            '147,New York Yankees,120,0.351,0.362,0.271,0.458,42.0,9.0',
            '147,New York Yankees,80,0.341,0.356,0.264,0.441,40.0,8.0',
            '111,Boston Red Sox,110,0.318,0.329,0.248,0.411,37.0,7.0',
            '111,Boston Red Sox,90,0.311,0.321,0.241,0.403,35.0,6.0'
          ].join('\n')
        })
      }

      const statPayloads = {
        '147:overall': { gamesPlayed: 20, runs: 110, hits: 190, atBats: 700, baseOnBalls: 80, strikeOuts: 150, avg: '.271', obp: '.349', slg: '.455', ops: '.804', iso: '.184', plateAppearances: 800 },
        '147:vr': { gamesPlayed: 16, runs: 88, hits: 150, atBats: 560, baseOnBalls: 60, strikeOuts: 120, avg: '.268', obp: '.344', slg: '.448', ops: '.792', iso: '.180', plateAppearances: 640 },
        '147:vl': { gamesPlayed: 4, runs: 22, hits: 40, atBats: 140, baseOnBalls: 20, strikeOuts: 30, avg: '.286', obp: '.371', slg: '.486', ops: '.857', iso: '.200', plateAppearances: 160 },
        '147:home': { gamesPlayed: 10, runs: 60, hits: 98, atBats: 350, baseOnBalls: 44, strikeOuts: 70, avg: '.280', obp: '.358', slg: '.470', ops: '.828', iso: '.190', plateAppearances: 400 },
        '147:away': { gamesPlayed: 10, runs: 50, hits: 92, atBats: 350, baseOnBalls: 36, strikeOuts: 80, avg: '.263', obp: '.340', slg: '.440', ops: '.780', iso: '.177', plateAppearances: 400 },
        '111:overall': { gamesPlayed: 20, runs: 92, hits: 175, atBats: 705, baseOnBalls: 62, strikeOuts: 168, avg: '.248', obp: '.317', slg: '.402', ops: '.719', iso: '.154', plateAppearances: 790 },
        '111:vr': { gamesPlayed: 15, runs: 65, hits: 130, atBats: 530, baseOnBalls: 44, strikeOuts: 126, avg: '.245', obp: '.311', slg: '.390', ops: '.701', iso: '.145', plateAppearances: 590 },
        '111:vl': { gamesPlayed: 5, runs: 27, hits: 45, atBats: 175, baseOnBalls: 18, strikeOuts: 42, avg: '.257', obp: '.334', slg: '.438', ops: '.772', iso: '.181', plateAppearances: 200 },
        '111:home': { gamesPlayed: 10, runs: 48, hits: 90, atBats: 352, baseOnBalls: 34, strikeOuts: 80, avg: '.256', obp: '.325', slg: '.418', ops: '.743', iso: '.162', plateAppearances: 395 },
        '111:away': { gamesPlayed: 10, runs: 44, hits: 85, atBats: 353, baseOnBalls: 28, strikeOuts: 88, avg: '.241', obp: '.309', slg: '.386', ops: '.695', iso: '.145', plateAppearances: 395 }
      }

      const statMatch = target.match(/\/teams\/(147|111)\/stats\?stats=season&group=hitting(?:&(sitCodes=vr|sitCodes=vl|homeRoad=H|homeRoad=A))?/) 
      if (statMatch) {
        const teamId = statMatch[1]
        const splitKey = statMatch[2] === 'sitCodes=vr'
          ? 'vr'
          : statMatch[2] === 'sitCodes=vl'
            ? 'vl'
            : statMatch[2] === 'homeRoad=H'
              ? 'home'
              : statMatch[2] === 'homeRoad=A'
                ? 'away'
                : 'overall'
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
                stat: statPayloads[`${teamId}:${splitKey}`]
              }]
            }]
          }
        })
      }

      if (target.includes('/teams/147/stats?stats=gameLog&group=hitting&season=')) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [
                { date: '2026-03-21', stat: { runs: 6, hits: 10, atBats: 34, baseOnBalls: 4, strikeOuts: 7, doubles: 2, triples: 0, homeRuns: 1, totalBases: 15 } },
                { date: '2026-03-20', stat: { runs: 5, hits: 9, atBats: 33, baseOnBalls: 3, strikeOuts: 8, doubles: 1, triples: 0, homeRuns: 2, totalBases: 16 } },
                { date: '2026-03-15', stat: { runs: 4, hits: 8, atBats: 32, baseOnBalls: 2, strikeOuts: 6, doubles: 2, triples: 0, homeRuns: 1, totalBases: 13 } },
                { date: '2026-03-10', stat: { runs: 3, hits: 7, atBats: 31, baseOnBalls: 2, strikeOuts: 9, doubles: 1, triples: 0, homeRuns: 0, totalBases: 8 } }
              ]
            }]
          }
        })
      }

      if (target.includes('/teams/111/stats?stats=gameLog&group=hitting&season=')) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [
                { date: '2026-03-21', stat: { runs: 4, hits: 8, atBats: 35, baseOnBalls: 2, strikeOuts: 8, doubles: 1, triples: 0, homeRuns: 1, totalBases: 12 } },
                { date: '2026-03-18', stat: { runs: 3, hits: 7, atBats: 34, baseOnBalls: 3, strikeOuts: 9, doubles: 2, triples: 0, homeRuns: 0, totalBases: 9 } },
                { date: '2026-03-11', stat: { runs: 5, hits: 9, atBats: 34, baseOnBalls: 4, strikeOuts: 10, doubles: 1, triples: 0, homeRuns: 2, totalBases: 16 } }
              ]
            }]
          }
        })
      }

      return createJsonResponse({ body: {} })
    },
    async () => {
      const res = createMockResponse()
      await handler(createRequest(), res)

      assert.equal(res.statusCode, 200)
      const payload = redisMock.snapshot('mlb:stats:offense')
      assert.equal(Object.keys(payload).length, 2)
      assert.equal(payload['New York Yankees'].runsPerGame, 5.5)
      assert.equal(payload['New York Yankees'].weightedOnBaseAverage, 0.347)
      assert.equal(payload['New York Yankees'].expectedWeightedOnBaseAverage, 0.36)
      assert.equal(payload['New York Yankees'].hardHitRate, 0.412)
      assert.equal(payload['New York Yankees'].barrelRate, 0.086)
      assert.equal(payload['New York Yankees'].weightedRunsCreatedPlus, 104.8)
      assert.equal(payload['New York Yankees'].splits.vsLeftHanded.ops, 0.857)
      assert.equal(payload['New York Yankees'].splits.last7Days.gamesPlayed, 2)
      assert.equal(payload['Boston Red Sox'].splits.last14Days.gamesPlayed, 3)
    }
  ))
})

test("runPipeline returns a redacted failed-step payload when a child route fails", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/runPipeline.js")
  const redisMock = createMockRedis()

  await withSilencedConsole(async () => withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      if (String(url).includes("/schedule?")) {
        return createJsonResponse({ ok: false, status: 401, body: { message: "denied" } })
      }

      return createJsonResponse({ body: {} })
    },
    async () => {
      const req = createRequest()
      const res = createMockResponse()

      await handler(req, res)

      assert.equal(res.statusCode, 500)
      assert.equal(res.body.ok, false)
      assert.equal(res.body.failedStep, "fetchGames")
      assert.equal(res.body.completedSteps, 0)
      assert.deepEqual(res.body.steps[0], {
        step: "fetchGames",
        status: "failed",
        statusCode: 500,
        result: {
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR"
        }
      })
      assert.equal(JSON.stringify(res.body).includes("denied"), false)
      assert.equal(JSON.stringify(res.body).includes("401"), false)
    }
  )))
})

test("operational routes return 503 when the admin secret is not configured", { concurrency: false }, async () => {
  const originalAdminSecret = process.env.ADMIN_API_SECRET
  const originalCronSecret = process.env.CRON_SECRET

  delete process.env.ADMIN_API_SECRET
  delete process.env.CRON_SECRET
  process.env.ODDS_API_KEY = "test-odds-key"

  try {
    const handler = await importRoute("../pages/api/fetchGames.js")
    const res = createMockResponse()

    await handler(createRequest(), res)

    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, {
      error: "Admin API secret is not configured"
    })
  } finally {
    if (originalAdminSecret === undefined) {
      delete process.env.ADMIN_API_SECRET
    } else {
      process.env.ADMIN_API_SECRET = originalAdminSecret
    }

    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  }
})

test("fetchGames stores venue-level ballpark factors on each game", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchGames.js")
  const redisMock = createMockRedis()
  const res = createMockResponse()

  await withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      const target = String(url)

      assert.match(target, /statsapi\.mlb\.com\/api\/v1\/schedule/)

      return createJsonResponse({
        body: {
          dates: [
            {
              games: [
                {
                  gamePk: 123,
                  gameDate: "2025-04-10T23:10:00Z",
                  gameType: "R",
                  teams: {
                    home: {
                      team: { name: "New York Yankees" },
                      probablePitcher: { fullName: "Gerrit Cole" }
                    },
                    away: {
                      team: { name: "Boston Red Sox" },
                      probablePitcher: { fullName: "Tanner Houck" }
                    }
                  },
                  venue: {
                    id: 3313,
                    name: "Yankee Stadium"
                  },
                  status: {
                    detailedState: "Scheduled"
                  }
                }
              ]
            }
          ]
        }
      })
    },
    async () => {
      await handler(createRequest(), res)
    }
  ))

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.gamesToday, 1)
  assert.equal(redisMock.snapshot("mlb:games:today")[0].venueId, 3313)
  assert.equal(redisMock.snapshot("mlb:games:today")[0].ballpark.classification, "neutral")
  assert.equal(redisMock.snapshot("mlb:games:today")[0].ballpark.homeRunFactor, 1.12)
  assert.equal(redisMock.snapshot("mlb:ballparkFactors:current").ballparks.length > 0, true)
})


test("fetchPitcherStats stores advanced pitcher metrics and computed K-BB%, FIP, and xFIP", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  process.env.ODDS_API_KEY = "test-odds-key"

  const handler = await importRoute("../pages/api/fetchPitcherStats.js")
  const redisMock = createMockRedis([
    ["mlb:games:today", [
      {
        gameId: "game-1",
        homePitcher: "Home Pitcher",
        awayPitcher: "Away Pitcher"
      }
    ]]
  ])

  await withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      const target = String(url)

      if (target.includes("/people/search?names=Home%20Pitcher")) {
        return createJsonResponse({
          body: { people: [{ id: 2, fullName: "Home Pitcher" }] }
        })
      }

      if (target.includes("/people/search?names=Away%20Pitcher")) {
        return createJsonResponse({
          body: { people: [{ id: 1, fullName: "Away Pitcher" }] }
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
            stats: [{
              splits: [{
                stat: {
                  era: "3.50",
                  earnedRuns: "100",
                  inningsPitched: "257.1",
                  homeRuns: "30",
                  baseOnBalls: "80",
                  hitBatsmen: "8",
                  strikeOuts: "280",
                  flyOuts: "210"
                }
              }]
            }]
          }
        })
      }

      if (target.includes("/api/v1/teams/111/stats?stats=season&group=pitching")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
                stat: {
                  era: "3.80",
                  earnedRuns: "104",
                  inningsPitched: "246.0",
                  homeRuns: "32",
                  baseOnBalls: "84",
                  hitBatsmen: "7",
                  strikeOuts: "255",
                  flyOuts: "205"
                }
              }]
            }]
          }
        })
      }

      if (target.includes("/people/1/stats")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
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
              }]
            }]
          }
        })
      }

      if (target.includes("/people/2/stats")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
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
              }]
            }]
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
      const res = createMockResponse()
      await handler(createRequest(), res)

      assert.equal(res.statusCode, 200)
      const payload = redisMock.snapshot("mlb:stats:pitchers")
      assert.equal(Object.keys(payload).length, 2)
      assert.equal(payload["Home Pitcher"].pitcherId, 2)
      assert.equal(payload["Home Pitcher"].throwingHand, null)
      assert.equal(payload["Home Pitcher"].xera, 2.98)
      assert.equal(payload["Home Pitcher"].strikeoutRate, 0.312)
      assert.ok(Math.abs(payload["Home Pitcher"].walkRate - 0.054) < 1e-9)
      assert.ok(Math.abs(payload["Home Pitcher"].strikeoutMinusWalkRate - 0.258) < 1e-9)
      assert.equal(payload["Home Pitcher"].expectedBattingAverageAgainst, 0.205)
      assert.equal(payload["Home Pitcher"].expectedSluggingAgainst, 0.332)
      assert.equal(payload["Home Pitcher"].hardHitRate, 0.311)
      assert.equal(payload["Home Pitcher"].barrelRate, 0.062)
      assert.equal(payload["Home Pitcher"].averageExitVelocity, 87.4)
      assert.equal(typeof payload["Home Pitcher"].fip, "number")
      assert.equal(typeof payload["Home Pitcher"].xfip, "number")
    }
  ))
})

test("fetchPitcherStats tolerates transient team and pitcher directory upstream failures", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  const handler = await importRoute("../pages/api/fetchPitcherStats.js")
  const redisMock = createMockRedis([
    ["mlb:games:today", [
      {
        gameId: "game-1",
        homePitcher: "Home Pitcher",
        awayPitcher: "Away Pitcher"
      }
    ]]
  ])

  await withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      const target = String(url)

      if (target.includes("/people/search?names=Home%20Pitcher")) {
        return createJsonResponse({
          body: { people: [{ id: 2, fullName: "Home Pitcher" }] }
        })
      }

      if (target.includes("/people/search?names=Away%20Pitcher")) {
        throw new Error("Temporary MLB API search outage")
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
            stats: [{
              splits: [{
                stat: {
                  era: "3.50",
                  earnedRuns: "100",
                  inningsPitched: "257.1",
                  homeRuns: "30",
                  baseOnBalls: "80",
                  hitBatsmen: "8",
                  strikeOuts: "280",
                  flyOuts: "210"
                }
              }]
            }]
          }
        })
      }

      if (target.includes("/api/v1/teams/111/stats?stats=season&group=pitching")) {
        throw new Error("Temporary MLB API team stats outage")
      }

      if (target.includes("/people/2/stats")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
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
              }]
            }]
          }
        })
      }

      if (target.includes("baseballsavant.mlb.com/leaderboard/custom")) {
        return createTextResponse({
          body: [
            "player_id,pitcher,k_percent,bb_percent,xba,xslg,xera,hard_hit_percent,barrel_batted_rate,exit_velocity_avg",
            "2,Home Pitcher,31.2,5.4,0.205,0.332,2.98,31.1,6.2,87.4"
          ].join("\n")
        })
      }

      return createJsonResponse({ body: {} })
    },
    async () => {
      const res = createMockResponse()
      await handler(createRequest(), res)

      assert.equal(res.statusCode, 200)
      assert.equal(res.body.pitchersCollected, 1)
      const payload = redisMock.snapshot("mlb:stats:pitchers")
      assert.deepEqual(Object.keys(payload), ["Home Pitcher"])
    }
  ))
})

test("fetchBullpenStats tolerates transient team pitching upstream failures", { concurrency: false }, async () => {
  process.env.ADMIN_API_SECRET = "test-admin-secret"
  const handler = await importRoute("../pages/api/fetchBullpenStats.js")
  const redisMock = createMockRedis()

  await withPatchedRedis(redisMock, async () => withMockedFetch(
    async (url) => {
      const target = String(url)

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

      if (target.includes("/api/v1/teams/147/stats?stats=season&group=pitching&sitCodes=rp")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
                stat: {
                  era: "3.50",
                  whip: "1.12",
                  inningsPitched: "257.1",
                  strikeOuts: "280",
                  baseOnBalls: "80",
                  homeRuns: "30",
                  hitBatsmen: "8",
                  flyOuts: "210"
                }
              }]
            }]
          }
        })
      }

      if (target.includes("/api/v1/teams/147/stats?stats=season&group=pitching")) {
        return createJsonResponse({
          body: {
            stats: [{
              splits: [{
                stat: {
                  era: "3.60",
                  whip: "1.18",
                  inningsPitched: "270.0",
                  strikeOuts: "290",
                  baseOnBalls: "85",
                  homeRuns: "33",
                  hitBatsmen: "9",
                  flyOuts: "220"
                }
              }]
            }]
          }
        })
      }

      if (target.includes("/api/v1/teams/111/stats?stats=season&group=pitching&sitCodes=rp")) {
        throw new Error("Temporary MLB API team stats outage")
      }

      if (target.includes("baseballsavant.mlb.com/leaderboard/custom")) {
        return createTextResponse({
          body: "player_id,pitcher,k_percent,bb_percent,xba,xslg,xera,hard_hit_percent,barrel_batted_rate,exit_velocity_avg"
        })
      }

      if (target.includes("/roster?")) {
        return createJsonResponse({ body: { roster: [] } })
      }

      if (target.includes("/schedule?")) {
        return createJsonResponse({ body: { dates: [] } })
      }

      return createJsonResponse({ body: {} })
    },
    async () => {
      const res = createMockResponse()
      await handler(createRequest(), res)

      assert.equal(res.statusCode, 200)
      assert.equal(res.body.teamsCollected, 1)
      const payload = redisMock.snapshot("mlb:stats:bullpen")
      assert.deepEqual(Object.keys(payload), ["New York Yankees"])
    }
  ))
})
