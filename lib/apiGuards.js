function getRequestHeader(req, headerName) {
  if (!req?.headers) return null

  const directHeader = req.headers[headerName]

  if (typeof directHeader === "string") {
    return directHeader
  }

  const normalizedHeader = req.headers[headerName.toLowerCase()]

  if (typeof normalizedHeader === "string") {
    return normalizedHeader
  }

  return null
}

function getClientIp(req) {
  const forwardedFor = getRequestHeader(req, "x-forwarded-for")

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }

  const realIp = getRequestHeader(req, "x-real-ip")

  if (realIp) {
    return realIp.trim()
  }

  return req?.socket?.remoteAddress || "unknown"
}

function buildRetryAfterSeconds(value) {
  return Math.max(1, Math.ceil(Number(value) || 0))
}

export async function enforceIpRateLimit(req, res, redisClient, options) {
  const { keyPrefix, limit, windowSeconds, routeName } = options
  const clientIp = getClientIp(req)
  const rateKey = `${keyPrefix}:ip:${clientIp}`
  const requestCount = await redisClient.incr(rateKey)

  if (requestCount === 1) {
    await redisClient.expire(rateKey, windowSeconds)
  }

  if (requestCount <= limit) {
    return true
  }

  const ttlSeconds = buildRetryAfterSeconds(await redisClient.ttl(rateKey))
  res.setHeader("Retry-After", String(ttlSeconds))
  res.status(429).json({
    error: `${routeName} rate limit exceeded`,
    code: "RATE_LIMITED",
    retryAfterSeconds: ttlSeconds
  })

  return false
}

export async function acquireJobLock(redisClient, key, ttlSeconds) {
  const ownerToken = `${key}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  const acquired = await redisClient.set(key, ownerToken, {
    nx: true,
    ex: ttlSeconds
  })

  if (!acquired) {
    const ttl = buildRetryAfterSeconds(await redisClient.ttl(key))

    return {
      acquired: false,
      retryAfterSeconds: ttl
    }
  }

  return {
    acquired: true,
    ownerToken
  }
}

export async function releaseJobLock(redisClient, key, ownerToken) {
  if (!ownerToken) {
    return
  }

  const currentOwner = await redisClient.get(key)

  if (currentOwner === ownerToken) {
    await redisClient.del(key)
  }
}

export async function enforceJobLock(req, res, redisClient, options) {
  const { key, ttlSeconds, routeName } = options
  const lock = await acquireJobLock(redisClient, key, ttlSeconds)

  if (!lock.acquired) {
    res.setHeader("Retry-After", String(lock.retryAfterSeconds))
    res.status(409).json({
      error: `${routeName} is already running`,
      code: "JOB_ALREADY_RUNNING",
      retryAfterSeconds: lock.retryAfterSeconds
    })

    return null
  }

  return lock.ownerToken
}

export async function enforceCooldown(res, redisClient, options) {
  const { key, cooldownSeconds, routeName } = options
  const state = await redisClient.get(key)

  if (!state || typeof state !== "object") {
    return true
  }

  const retryAfterSeconds = buildRetryAfterSeconds(
    (Number(state.nextAllowedAt) - Date.now()) / 1000
  )

  if (Number(state.nextAllowedAt) <= Date.now()) {
    return true
  }

  res.setHeader("Retry-After", String(retryAfterSeconds))
  res.status(429).json({
    error: `${routeName} cooldown is active`,
    code: "COOLDOWN_ACTIVE",
    retryAfterSeconds
  })

  return false
}

export async function markCooldown(redisClient, key, cooldownSeconds) {
  const now = Date.now()
  const nextAllowedAt = now + (cooldownSeconds * 1000)

  await redisClient.set(
    key,
    {
      lastTriggeredAt: now,
      nextAllowedAt
    },
    {
      ex: cooldownSeconds * 2
    }
  )
}
