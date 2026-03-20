import test from "node:test"
import assert from "node:assert/strict"

import {
  acquireJobLock,
  enforceCooldown,
  enforceIpRateLimit,
  markCooldown,
  releaseJobLock
} from "../lib/apiGuards.js"

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

function createMockRedis() {
  const store = new Map()
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
    }
  }
}

test("enforceIpRateLimit throttles requests above the configured ceiling", async () => {
  const redis = createMockRedis()
  const req = {
    headers: {
      "x-forwarded-for": "203.0.113.10"
    }
  }

  const firstRes = createMockResponse()
  const firstAllowed = await enforceIpRateLimit(req, firstRes, redis, {
    keyPrefix: "mlb:test:rate",
    limit: 1,
    windowSeconds: 60,
    routeName: "fetchOdds"
  })

  const secondRes = createMockResponse()
  const secondAllowed = await enforceIpRateLimit(req, secondRes, redis, {
    keyPrefix: "mlb:test:rate",
    limit: 1,
    windowSeconds: 60,
    routeName: "fetchOdds"
  })

  assert.equal(firstAllowed, true)
  assert.equal(secondAllowed, false)
  assert.equal(secondRes.statusCode, 429)
  assert.equal(secondRes.body.code, "RATE_LIMITED")
  assert.equal(secondRes.headers["Retry-After"], "60")
})

test("acquireJobLock and releaseJobLock preserve lock ownership", async () => {
  const redis = createMockRedis()
  const lock = await acquireJobLock(redis, "mlb:test:lock", 120)

  assert.equal(lock.acquired, true)
  assert.equal(typeof lock.ownerToken, "string")

  const secondAttempt = await acquireJobLock(redis, "mlb:test:lock", 120)

  assert.equal(secondAttempt.acquired, false)
  assert.equal(secondAttempt.retryAfterSeconds, 120)

  await releaseJobLock(redis, "mlb:test:lock", "wrong-owner")
  assert.equal(await redis.get("mlb:test:lock"), lock.ownerToken)

  await releaseJobLock(redis, "mlb:test:lock", lock.ownerToken)
  assert.equal(await redis.get("mlb:test:lock"), null)
})

test("markCooldown and enforceCooldown block requests until the window expires", async () => {
  const redis = createMockRedis()
  const res = createMockResponse()

  await markCooldown(redis, "mlb:test:cooldown", 30)

  const allowed = await enforceCooldown(res, redis, {
    key: "mlb:test:cooldown",
    cooldownSeconds: 30,
    routeName: "loadHistorical"
  })

  assert.equal(allowed, false)
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.code, "COOLDOWN_ACTIVE")
  assert.equal(res.headers["Retry-After"], "30")
})
