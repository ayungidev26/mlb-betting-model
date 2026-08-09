import loadHistoricalHandler from "../loadHistorical.js"
import buildRatingsHandler from "../buildRatings.js"
import { redis } from "../../../lib/upstash.js"
import {
  getOperationalRouteSecret,
  requireCronRouteAccess
} from "../../../lib/apiSecurity.js"
import { acquireJobLock, releaseJobLock } from "../../../lib/apiGuards.js"
import { isWeeklyRatingsRefreshWindow } from "../../../lib/cronSchedule.js"

const RATINGS_REFRESH_LOCK = {
  key: "mlb:lock:weeklyRatingsRefresh",
  // Keep the distributed lock longer than the 35-minute Actions timeout so a
  // replacement/manual run cannot overlap a worker that is still winding down.
  ttlSeconds: 40 * 60
}
const DEFAULT_START_SEASON = 2015

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    setHeader(name, value) { this.headers[name] = value }
  }
}

async function invokeOperationalHandler(handler, query, operationalSecret) {
  const response = createMockResponse()
  await handler({
    method: "POST",
    query,
    headers: {
      authorization: `Bearer ${operationalSecret}`,
      "x-forwarded-for": "127.0.0.1",
      "x-scheduler-source": "weekly-ratings-refresh"
    },
    socket: { remoteAddress: "127.0.0.1" }
  }, response)
  return response
}

function configuredStartSeason(config, meta, currentSeason) {
  const startSeason = Number.parseInt(config?.startSeason ?? meta?.startSeason, 10)
  return Number.isInteger(startSeason) && startSeason <= currentSeason
    ? startSeason
    : DEFAULT_START_SEASON
}

export default async function handler(req, res) {
  if (!requireCronRouteAccess(req, res)) return

  const force = req?.query?.force === "true"
  const schedulerWindow = isWeeklyRatingsRefreshWindow()

  if (!force && !schedulerWindow.matchesTargetTime) {
    return res.status(202).json({
      ok: true,
      skipped: true,
      reason: "Outside the Monday 01:07 America/New_York active-season refresh window",
      schedulerWindow
    })
  }

  const lock = await acquireJobLock(
    redis,
    RATINGS_REFRESH_LOCK.key,
    RATINGS_REFRESH_LOCK.ttlSeconds
  )

  if (!lock.acquired) {
    res.setHeader("Retry-After", String(lock.retryAfterSeconds))
    return res.status(409).json({
      ok: false,
      error: "Weekly ratings refresh is already running",
      code: "JOB_ALREADY_RUNNING",
      retryAfterSeconds: lock.retryAfterSeconds
    })
  }

  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()

  try {
    const operationalSecret = getOperationalRouteSecret()
    if (!operationalSecret) {
      return res.status(503).json({ ok: false, error: "Operational route secret is not configured" })
    }

    const currentSeason = new Date().getUTCFullYear()
    const historicalMeta = await redis.get("mlb:games:historical:meta")
    const ratingsRange = await redis.get("mlb:ratings:historicalRange")
    const startSeason = configuredStartSeason(ratingsRange, historicalMeta, currentSeason)
    console.info("[runWeeklyRatingsRefresh] refreshing current-season historical games", {
      currentSeason,
      configuredRange: { startSeason, endSeason: currentSeason },
      trigger: force ? "manual" : "cron"
    })

    const historical = await invokeOperationalHandler(loadHistoricalHandler, {
      startSeason: String(currentSeason),
      endSeason: String(currentSeason)
    }, operationalSecret)

    if (historical.statusCode >= 400) {
      console.error("[runWeeklyRatingsRefresh] historical load failed; ratings build not started", {
        currentSeason,
        statusCode: historical.statusCode,
        code: historical.body?.code || null
      })
      return res.status(historical.statusCode).json({
        ok: false,
        status: "failed",
        startedAt,
        durationMs: Date.now() - startedAtMs,
        seasonRefreshed: currentSeason,
        stoppedAfter: "loadHistorical",
        historical: historical.body,
        ratingsBuild: null
      })
    }

    const ratings = await invokeOperationalHandler(buildRatingsHandler, {
      startSeason: String(startSeason),
      endSeason: String(currentSeason)
    }, operationalSecret)

    if (ratings.statusCode >= 400) {
      console.error("[runWeeklyRatingsRefresh] ratings build failed", {
        currentSeason,
        statusCode: ratings.statusCode,
        code: ratings.body?.code || null
      })
      return res.status(ratings.statusCode).json({
        ok: false,
        status: "failed",
        startedAt,
        durationMs: Date.now() - startedAtMs,
        seasonRefreshed: currentSeason,
        stoppedAfter: "buildRatings",
        historical: historical.body,
        ratingsBuild: ratings.body
      })
    }

    const storedMetadata = await redis.get("mlb:ratings:teams:meta")
    const storedRatings = await redis.get("mlb:ratings:teams")
    const storedRatingsCount = storedRatings && typeof storedRatings === "object"
      ? Object.keys(storedRatings).length
      : 0
    const metadataVerified = Boolean(
      storedMetadata &&
      storedMetadata.generatedAt === ratings.body?.metadata?.generatedAt &&
      Number(storedMetadata.season) === currentSeason &&
      Number(storedMetadata.startSeason) === startSeason &&
      Number(storedMetadata.gamesProcessed) === Number(ratings.body?.gamesProcessed) &&
      storedRatingsCount > 0 &&
      storedRatingsCount === Number(ratings.body?.teamsRated)
    )

    if (!metadataVerified) {
      console.error("[runWeeklyRatingsRefresh] ratings metadata verification failed", {
        currentSeason,
        expectedGeneratedAt: ratings.body?.metadata?.generatedAt || null
      })
      return res.status(500).json({
        ok: false,
        status: "failed",
        startedAt,
        durationMs: Date.now() - startedAtMs,
        seasonRefreshed: currentSeason,
        stoppedAfter: "metadataVerification",
        historical: historical.body,
        ratingsBuild: ratings.body,
        metadataVerified: false
      })
    }

    // This is configuration/operational metadata, not ratings freshness. Only
    // advance it after both writes above have been read back and verified.
    await redis.set("mlb:ratings:historicalRange", {
      startSeason,
      endSeason: currentSeason,
      updatedAt: new Date().toISOString()
    })

    const durationMs = Date.now() - startedAtMs

    console.info("[runWeeklyRatingsRefresh] weekly ratings refresh completed", {
      currentSeason,
      gamesLoaded: historical.body?.gamesCollected,
      ratingsGeneratedAt: storedMetadata.generatedAt,
      latestSeasonIncluded: storedMetadata.season,
      ratingsCount: storedRatingsCount,
      durationMs
    })

    return res.status(200).json({
      ok: true,
      status: "succeeded",
      trigger: force ? "manual" : "cron",
      startedAt,
      durationMs,
      seasonRefreshed: currentSeason,
      historicalGamesLoaded: historical.body?.gamesCollected || 0,
      historical: historical.body,
      ratingsBuild: ratings.body,
      ratingsGeneratedAt: storedMetadata.generatedAt,
      latestSeasonIncluded: storedMetadata.season,
      ratingsCount: storedRatingsCount,
      metadataVerified: true
    })
  } catch (error) {
    console.error("[runWeeklyRatingsRefresh] unexpected failure", { message: error.message })
    return res.status(500).json({
      ok: false,
      status: "failed",
      startedAt,
      durationMs: Date.now() - startedAtMs,
      error: error.message
    })
  } finally {
    await releaseJobLock(redis, RATINGS_REFRESH_LOCK.key, lock.ownerToken)
  }
}
