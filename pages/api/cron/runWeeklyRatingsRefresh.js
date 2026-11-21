import loadHistoricalHandler from "../loadHistorical.js"
import buildRatingsHandler from "../buildRatings.js"
import evaluatePredictionsHandler from "../evaluatePredictions.js"
import { redis } from "../../../lib/upstash.js"
import {
  getOperationalRouteSecret,
  requireCronOrOperationalRouteAccess,
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

async function invokeOperationalHandler(handler, query, operationalSecret, body) {
  const response = createMockResponse()
  await handler({
    method: "POST",
    query,
    body,
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
  const force = req?.query?.force === "true"

  // Scheduled invocations remain restricted to CRON_SECRET. A forced recovery
  // is also available to the operational admin credential so the market
  // workflow can repair stale ratings when CRON_SECRET is intentionally not
  // configured in GitHub Actions.
  const authorized = force
    ? requireCronOrOperationalRouteAccess(req, res)
    : requireCronRouteAccess(req, res)
  if (!authorized) return

  const closeout = force ? req?.query?.closeout : undefined
  if (closeout !== undefined && !["preview", "apply"].includes(closeout)) {
    return res.status(400).json({ ok: false, error: "closeout must be preview or apply" })
  }

  const schedulerWindow = isWeeklyRatingsRefreshWindow()
  const month = Number(schedulerWindow.dateKey.slice(5, 7))
  if (closeout && month >= 3 && month <= 10) {
    return res.status(409).json({ ok: false, error: "Season closeout is available November through February" })
  }

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

    const currentSeason = Number(schedulerWindow.dateKey.slice(0, 4)) - (closeout && month <= 2 ? 1 : 0)
    const [historicalMeta, ratingsRange, previousRatingsMeta] = await Promise.all([
      redis.get("mlb:games:historical:meta"),
      redis.get("mlb:ratings:historicalRange"),
      redis.get("mlb:ratings:teams:meta")
    ])
    const startSeason = configuredStartSeason(ratingsRange ?? previousRatingsMeta, historicalMeta, currentSeason)
    console.info("[runWeeklyRatingsRefresh] refreshing current-season historical games", {
      currentSeason,
      configuredRange: { startSeason, endSeason: currentSeason },
      trigger: force ? "manual" : "cron"
    })

    const seasonRange = { startSeason: String(currentSeason), endSeason: String(currentSeason) }
    if (closeout === "preview") {
      const preview = await invokeOperationalHandler(loadHistoricalHandler, {
        ...seasonRange, dryRun: "true"
      }, operationalSecret)
      return res.status(preview.statusCode).json({
        ok: preview.statusCode < 400,
        closeout,
        season: currentSeason,
        historical: preview.body
      })
    }

    const historical = await invokeOperationalHandler(loadHistoricalHandler, seasonRange, operationalSecret)
    const previousCloseout = !closeout && month === 3 && historical.body?.code === "NO_HISTORICAL_FINALS"
      ? await redis.get(`mlb:seasonSummary:${currentSeason - 1}`)
      : null
    const ratingsEndSeason = previousCloseout?.season === currentSeason - 1 ? currentSeason - 1 : currentSeason

    if (historical.statusCode >= 400 && ratingsEndSeason === currentSeason) {
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
      endSeason: String(ratingsEndSeason)
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
      Number(storedMetadata.season) === ratingsEndSeason &&
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
      endSeason: ratingsEndSeason,
      updatedAt: new Date().toISOString()
    })

    let seasonSummary = null
    if (closeout) {
      const storedFinals = await redis.get(`mlb:games:historical:${currentSeason}`)
      if (!Array.isArray(storedFinals) || storedFinals.length !== historical.body.gamesCollected ||
          storedMetadata.dataThrough !== historical.body.comparisons[0].latestOfficialDate) {
        return res.status(502).json({ ok: false, stoppedAfter: "historicalVerification", season: currentSeason })
      }
      const evaluation = await invokeOperationalHandler(evaluatePredictionsHandler, {}, operationalSecret, {
        dateFrom: `${currentSeason}-03-01`,
        dateTo: `${currentSeason}-11-30`,
        persist: false
      })
      if (evaluation.statusCode >= 400 || !evaluation.body?.ok) {
        return res.status(502).json({ ok: false, stoppedAfter: "evaluation", season: currentSeason })
      }

      seasonSummary = {
        season: currentSeason,
        ratings: storedRatings,
        ratingsGeneratedAt: storedMetadata.generatedAt,
        dataThrough: storedMetadata.dataThrough,
        finalGames: historical.body.gamesCollected,
        evaluation: evaluation.body.aggregate,
        unmatched: evaluation.body.unmatchedStats.byReason
      }
      await redis.set(`mlb:seasonSummary:${currentSeason}`, seasonSummary)
    }

    const durationMs = Date.now() - startedAtMs

    console.info("[runWeeklyRatingsRefresh] weekly ratings refresh completed", {
      currentSeason,
      gamesLoaded: historical.body?.gamesCollected,
      ratingsGeneratedAt: storedMetadata.generatedAt,
      latestSeasonIncluded: storedMetadata.season,
      ...(ratingsEndSeason !== currentSeason ? { preseason: true } : {}),
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
      ...(ratingsEndSeason !== currentSeason ? { preseason: true } : {}),
      ratingsCount: storedRatingsCount,
      metadataVerified: true,
      ...(seasonSummary ? { seasonSummary } : {})
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
