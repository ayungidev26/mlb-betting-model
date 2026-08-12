// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import fetchPitcherStatsHandler from "./fetchPitcherStats.js"
import fetchBullpenStatsHandler from "./fetchBullpenStats.js"
import fetchTeamOffenseStatsHandler from "./fetchTeamOffenseStats.js"
import fetchGamesHandler from "./fetchGames.js"
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { runRoutePipeline } from "../../lib/routePipeline.js"
import {
  enforceIpRateLimit,
  enforceJobLock,
  releaseJobLock
} from "../../lib/apiGuards.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"

const RUN_STATS_PIPELINE_RATE_LIMIT = {
  keyPrefix: "mlb:limit:runStatsPipeline",
  limit: 4,
  windowSeconds: 60,
  routeName: "runStatsPipeline"
}
const RUN_STATS_PIPELINE_LOCK = {
  key: "mlb:lock:runStatsPipeline",
  ttlSeconds: 300,
  routeName: "runStatsPipeline"
}
const STATS_PIPELINE_MARKER_PREFIX = "mlb:cron:statsPipeline"
const STATS_PIPELINE_MARKER_TTL_SECONDS = 7 * 24 * 60 * 60

function shouldForceRun(query = {}) {
  return query.force === "true"
}

function buildMarkerKey(dateKey) {
  return `${STATS_PIPELINE_MARKER_PREFIX}:${dateKey}`
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, RUN_STATS_PIPELINE_RATE_LIMIT)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, RUN_STATS_PIPELINE_LOCK)

    if (!lockToken) {
      return
    }

    const force = shouldForceRun(req.query)
    const dateKey = getEasternDateKey()
    const markerKey = buildMarkerKey(dateKey)

    if (!force) {
      const claimed = await redis.set(
        markerKey,
        {
          triggeredAt: new Date().toISOString(),
          triggerType: "operational"
        },
        {
          nx: true,
          ex: STATS_PIPELINE_MARKER_TTL_SECONDS
        }
      )

      if (!claimed) {
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "Stats pipeline already ran for the current Eastern date",
          markerKey,
          dateKey
        })
      }
    }

    const pipeline = [
      {
        name: "fetchGames",
        handler: fetchGamesHandler
      },
      {
        name: "fetchPitcherStats",
        handler: fetchPitcherStatsHandler
      },
      {
        name: "fetchBullpenStats",
        handler: fetchBullpenStatsHandler
      },
      {
        name: "fetchTeamOffenseStats",
        handler: fetchTeamOffenseStatsHandler
      }
    ]

    const result = await runRoutePipeline(pipeline, req, {
      logContext: "runStatsPipeline"
    })

    if (!result.ok) {
      if (!force) {
        await redis.del(markerKey)
      }

      return res.status(result.failureStatusCode).json({
        ok: false,
        completedSteps: result.completedSteps,
        failedStep: result.failedStep,
        markerKey,
        dateKey,
        steps: result.steps,
        keys: {
          games: "mlb:games:today",
          gamesMeta: "mlb:games:today:meta",
          ballparkFactors: "mlb:ballparkFactors:current",
          pitcherStats: "mlb:stats:pitchers",
          pitcherStatsMeta: "mlb:stats:pitchers:meta",
          bullpenStats: "mlb:stats:bullpen",
          bullpenStatsMeta: "mlb:stats:bullpen:meta",
          offenseStats: "mlb:stats:offense",
          offenseStatsMeta: "mlb:stats:offense:meta"
        }
      })
    }

    return res.status(200).json({
      ok: true,
      completedSteps: result.completedSteps,
      markerKey,
      dateKey,
      force,
      steps: result.steps,
      keys: {
        games: "mlb:games:today",
        gamesMeta: "mlb:games:today:meta",
        ballparkFactors: "mlb:ballparkFactors:current",
        pitcherStats: "mlb:stats:pitchers",
        pitcherStatsMeta: "mlb:stats:pitchers:meta",
        bullpenStats: "mlb:stats:bullpen",
        bullpenStatsMeta: "mlb:stats:bullpen:meta",
        offenseStats: "mlb:stats:offense",
        offenseStatsMeta: "mlb:stats:offense:meta"
      }
    })
  } catch (error) {
    return sendRouteError(res, "runStatsPipeline", error)
  } finally {
    await releaseJobLock(redis, RUN_STATS_PIPELINE_LOCK.key, lockToken)
  }
}
