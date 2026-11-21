// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { collectHistoricalFinals, compareHistoricalFinals } from "../../lib/historicalGames.js"
import { validateExternalMlbSchedulePayload } from "../../lib/payloadValidation.js"
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
import {
  enforceCooldown,
  enforceIpRateLimit,
  enforceJobLock,
  markCooldown,
  releaseJobLock
} from "../../lib/apiGuards.js"

const LOAD_HISTORICAL_RATE_LIMIT = {
  keyPrefix: "mlb:limit:loadHistorical",
  limit: 2,
  windowSeconds: 3600,
  routeName: "loadHistorical"
}
const LOAD_HISTORICAL_LOCK = {
  key: "mlb:lock:loadHistorical",
  ttlSeconds: 900,
  routeName: "loadHistorical"
}
const LOAD_HISTORICAL_COOLDOWN = {
  key: "mlb:cooldown:loadHistorical",
  cooldownSeconds: 21600,
  routeName: "loadHistorical"
}

const DEFAULT_START_SEASON = 2015
const MAX_SEASON_RANGE = 30

function parseSeasonParam(rawValue, fallbackValue) {
  if (rawValue === undefined) {
    return {
      ok: true,
      value: fallbackValue
    }
  }

  const normalizedValue = Array.isArray(rawValue) ? rawValue[0] : rawValue

  if (typeof normalizedValue !== "string" || !/^\d+$/.test(normalizedValue)) {
    return {
      ok: false,
      message: "startSeason and endSeason must be integer years"
    }
  }

  return {
    ok: true,
    value: Number.parseInt(normalizedValue, 10)
  }
}

function buildSeasonRange(startSeason, endSeason) {
  return Array.from(
    { length: (endSeason - startSeason) + 1 },
    (_, index) => startSeason + index
  )
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, LOAD_HISTORICAL_RATE_LIMIT)) {
      return
    }

    const dryRun = req?.query?.dryRun === "true"

    if (!dryRun && !await enforceCooldown(res, redis, LOAD_HISTORICAL_COOLDOWN)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, LOAD_HISTORICAL_LOCK)

    if (!lockToken) {
      return
    }

    const currentUtcYear = new Date().getUTCFullYear()
    const parsedStartSeason = parseSeasonParam(
      req?.query?.startSeason,
      DEFAULT_START_SEASON
    )
    const parsedEndSeason = parseSeasonParam(
      req?.query?.endSeason,
      currentUtcYear
    )

    if (!parsedStartSeason.ok || !parsedEndSeason.ok) {
      res.status(400).json({
        error: "Invalid season range",
        code: "INVALID_SEASON_RANGE",
        details: "startSeason and endSeason must be integer years"
      })
      return
    }

    const startSeason = parsedStartSeason.value
    const endSeason = parsedEndSeason.value

    if (startSeason > endSeason) {
      res.status(400).json({
        error: "Invalid season range",
        code: "INVALID_SEASON_RANGE",
        details: "startSeason must be less than or equal to endSeason"
      })
      return
    }

    if (endSeason > currentUtcYear) {
      res.status(400).json({
        error: "Invalid season range",
        code: "INVALID_SEASON_RANGE",
        details: "endSeason cannot be greater than the current UTC year"
      })
      return
    }

    const seasonCount = (endSeason - startSeason) + 1

    if (seasonCount > MAX_SEASON_RANGE) {
      res.status(400).json({
        error: "Invalid season range",
        code: "INVALID_SEASON_RANGE",
        details: `season range cannot exceed ${MAX_SEASON_RANGE} seasons`
      })
      return
    }

    const seasons = buildSeasonRange(startSeason, endSeason)

    let totalGames = 0
    const seasonGamesByKey = new Map()
    const comparisons = []

    for (const season of seasons) {
      const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}`
      const data = await fetchJsonWithRetry(url)
      validateExternalMlbSchedulePayload(data)
      const seasonGames = collectHistoricalFinals(data, season)
      const key = `mlb:games:historical:${season}`
      const previous = await redis.get(key)
      const comparison = compareHistoricalFinals(previous, seasonGames, season, data)
      comparisons.push(comparison)
      if (!dryRun && comparison.missingFromSource.length > 0) {
        return res.status(409).json({
          error: "Historical refresh would remove stored games",
          code: "HISTORICAL_COVERAGE_REGRESSION",
          comparison
        })
      }
      seasonGamesByKey.set(key, seasonGames)
      totalGames += seasonGames.length
    }

    if (dryRun) {
      return res.status(200).json({ dryRun, gamesCollected: totalGames, comparisons, keysWritten: [] })
    }

    if (totalGames === 0 && seasons.length === 1) {
      return res.status(409).json({
        error: "MLB returned no eligible completed games for this season",
        code: "NO_HISTORICAL_FINALS",
        comparisons
      })
    }

    for (const [key, seasonGames] of seasonGamesByKey.entries()) {
      await redis.set(key, seasonGames)
    }

    await redis.set("mlb:games:historical:meta", {
      startSeason,
      endSeason,
      loadedAt: new Date().toISOString(),
      totalGames
    })

    await markCooldown(
      redis,
      LOAD_HISTORICAL_COOLDOWN.key,
      LOAD_HISTORICAL_COOLDOWN.cooldownSeconds
    )

    res.status(200).json({
      seasonsLoaded: seasons.length,
      gamesCollected: totalGames,
      comparisons,
      seasonRange: {
        startSeason,
        endSeason
      },
      keysWritten: [
        ...seasons.map((season) => `mlb:games:historical:${season}`),
        "mlb:games:historical:meta"
      ]
    })
  } catch (error) {
    return sendRouteError(res, "loadHistorical", error)
  } finally {
    await releaseJobLock(redis, LOAD_HISTORICAL_LOCK.key, lockToken)
  }
}
