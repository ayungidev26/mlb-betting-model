// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import fetchOddsHandler from "./fetchOdds.js"
import runModelHandler from "./runModel.js"
import findEdgesHandler from "./findEdges.js"
import { redis } from "../../lib/upstash.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { runRoutePipeline } from "../../lib/routePipeline.js"
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
      // Validate free/cached model prerequisites before spending Odds API quota.
      {
        name: "runModel",
        handler: runModelHandler
      },
      {
        name: "fetchOdds",
        handler: fetchOddsHandler,
        query: {
          refresh: "true"
        }
      },
      {
        name: "findEdges",
        handler: findEdgesHandler
      }
    ]

    const result = await runRoutePipeline(pipeline, req, {
      logContext: "runPipeline"
    })

    if (!result.ok) {
      const childError = result.failure && typeof result.failure === "object"
        ? result.failure
        : {}
      // Preserve the child route's status and safe error payload. Flattening every
      // failure to an opaque 500 made scheduled-run failures impossible to triage.
      return res.status(result.failureStatusCode).json({
        ok: false,
        error: childError.error || `Pipeline step ${result.failedStep} failed`,
        code: childError.code || "PIPELINE_STEP_FAILED",
        ...(childError.details ? { details: childError.details } : {}),
        completedSteps: result.completedSteps,
        failedStep: result.failedStep,
        steps: result.steps,
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

    return res.status(200).json({
      ok: true,
      completedSteps: result.completedSteps,
      steps: result.steps,
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
