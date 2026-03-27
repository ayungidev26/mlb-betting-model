// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import fetchPitcherStatsHandler from "./fetchPitcherStats.js"
import fetchBullpenStatsHandler from "./fetchBullpenStats.js"
import fetchTeamOffenseStatsHandler from "./fetchTeamOffenseStats.js"
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { logServerError, sendRouteError } from "../../lib/apiErrors.js"
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

async function invokeStep(handler, options = {}) {
  const req = {
    method: options.method || "POST",
    query: options.query || {},
    headers: options.headers || {}
  }
  const res = createMockResponse()

  try {
    await handler(req, res)

    return {
      ok: res.statusCode < 400,
      statusCode: res.statusCode,
      body: res.body
    }
  } catch (error) {
    logServerError("runStatsPipeline.invokeStep", error, {
      step: handler.name || "anonymous"
    })

    return {
      ok: false,
      statusCode: 500,
      body: {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR"
      }
    }
  }
}

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

    const steps = []

    for (const step of pipeline) {
      const result = await invokeStep(step.handler, {
        method: req.method,
        headers: req.headers
      })

      steps.push({
        step: step.name,
        status: result.ok ? "success" : "failed",
        statusCode: result.statusCode,
        result: result.body
      })

      if (!result.ok) {
        if (!force) {
          await redis.del(markerKey)
        }

        return res.status(500).json({
          ok: false,
          completedSteps: steps.filter(item => item.status === "success").length,
          failedStep: step.name,
          markerKey,
          dateKey,
          steps,
          keys: {
            pitcherStats: "mlb:stats:pitchers",
            pitcherStatsMeta: "mlb:stats:pitchers:meta",
            bullpenStats: "mlb:stats:bullpen",
            bullpenStatsMeta: "mlb:stats:bullpen:meta",
            offenseStats: "mlb:stats:offense",
            offenseStatsMeta: "mlb:stats:offense:meta"
          }
        })
      }
    }

    return res.status(200).json({
      ok: true,
      completedSteps: steps.length,
      markerKey,
      dateKey,
      force,
      steps,
      keys: {
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
