// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import fetchOddsHandler from "./fetchOdds.js"
import runModelHandler from "./runModel.js"
import findEdgesHandler from "./findEdges.js"
import { redis } from "../../lib/upstash.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { logServerError, sendRouteError } from "../../lib/apiErrors.js"
import {
  enforceIpRateLimit,
  enforceJobLock,
  releaseJobLock
} from "../../lib/apiGuards.js"

const RUN_PIPELINE_RATE_LIMIT = {
  keyPrefix: "mlb:limit:runPipeline",
  limit: 4,
  windowSeconds: 60,
  routeName: "runPipeline"
}
const RUN_PIPELINE_LOCK = {
  key: "mlb:lock:runPipeline",
  ttlSeconds: 300,
  routeName: "runPipeline"
}

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
    logServerError("runPipeline.invokeStep", error, {
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

async function readCachedGamesStatus(redisClient) {
  const [games, gamesMeta] = await Promise.all([
    redisClient.get("mlb:games:today"),
    redisClient.get("mlb:games:today:meta")
  ])
  const todayDateKey = getEasternDateKey()
  const cachedDateKey = gamesMeta?.dateKey || null
  const stale = Boolean(cachedDateKey && cachedDateKey !== todayDateKey)

  return {
    hasGamesCache: Array.isArray(games),
    gamesCount: Array.isArray(games) ? games.length : null,
    games,
    gamesMeta,
    todayDateKey,
    cachedDateKey,
    stale
  }
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, RUN_PIPELINE_RATE_LIMIT)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, RUN_PIPELINE_LOCK)

    if (!lockToken) {
      return
    }

    const gamesStatus = await readCachedGamesStatus(redis)

    if (!gamesStatus.hasGamesCache) {
      console.warn("[runPipeline] cached games are missing", {
        todayDateKey: gamesStatus.todayDateKey
      })

      return res.status(409).json({
        ok: false,
        error: "Today's games are not cached. Run /api/runStatsPipeline first.",
        code: "GAMES_CACHE_MISSING",
        todayDateKey: gamesStatus.todayDateKey,
        keys: {
          games: "mlb:games:today",
          gamesMeta: "mlb:games:today:meta"
        }
      })
    }

    if (gamesStatus.stale) {
      console.warn("[runPipeline] cached games are stale", {
        todayDateKey: gamesStatus.todayDateKey,
        cachedDateKey: gamesStatus.cachedDateKey,
        fetchedAt: gamesStatus.gamesMeta?.fetchedAt || null
      })

      return res.status(409).json({
        ok: false,
        error: "Today's cached games are stale. Run /api/runStatsPipeline first.",
        code: "GAMES_CACHE_STALE",
        todayDateKey: gamesStatus.todayDateKey,
        cachedDateKey: gamesStatus.cachedDateKey,
        fetchedAt: gamesStatus.gamesMeta?.fetchedAt || null,
        keys: {
          games: "mlb:games:today",
          gamesMeta: "mlb:games:today:meta"
        }
      })
    }

    console.info("[runPipeline] using cached games", {
      todayDateKey: gamesStatus.todayDateKey,
      gamesCount: gamesStatus.gamesCount,
      fetchedAt: gamesStatus.gamesMeta?.fetchedAt || null
    })

    const pipeline = [
      {
        name: "fetchOdds",
        handler: fetchOddsHandler,
        query: {
          refresh: "true"
        }
      },
      {
        name: "runModel",
        handler: runModelHandler
      },
      {
        name: "findEdges",
        handler: findEdgesHandler
      }
    ]

    const steps = []

    for (const step of pipeline) {
      const result = await invokeStep(step.handler, {
        method: req.method,
        query: step.query,
        headers: req.headers
      })

      steps.push({
        step: step.name,
        status: result.ok ? "success" : "failed",
        statusCode: result.statusCode,
        result: result.body
      })

      if (!result.ok) {
        return res.status(500).json({
          ok: false,
          completedSteps: steps.filter(item => item.status === "success").length,
          failedStep: step.name,
          steps,
          keys: {
            games: "mlb:games:today",
            ballparkFactors: "mlb:ballparkFactors:current",
            odds: "mlb:odds:today",
            cachedPitcherStats: "mlb:stats:pitchers",
            cachedBullpenStats: "mlb:stats:bullpen",
            cachedOffenseStats: "mlb:stats:offense",
            predictions: "mlb:predictions:today",
            edges: "mlb:edges:today"
          }
        })
      }
    }

    return res.status(200).json({
      ok: true,
      completedSteps: steps.length,
      steps,
      keys: {
        games: "mlb:games:today",
        gamesMeta: "mlb:games:today:meta",
        ballparkFactors: "mlb:ballparkFactors:current",
        odds: "mlb:odds:today",
        cachedPitcherStats: "mlb:stats:pitchers",
        cachedBullpenStats: "mlb:stats:bullpen",
        cachedOffenseStats: "mlb:stats:offense",
        predictions: "mlb:predictions:today",
        edges: "mlb:edges:today"
      }
    })
  } catch (error) {
    return sendRouteError(res, "runPipeline", error)
  } finally {
    await releaseJobLock(redis, RUN_PIPELINE_LOCK.key, lockToken)
  }
}
