// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { calculateElo } from "../../model/eloRatings.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"

const DEFAULT_START_SEASON = 2015

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

function parseMetaSeasonRange(meta, fallbackStart, fallbackEnd) {
  if (!meta || typeof meta !== "object") {
    return {
      startSeason: fallbackStart,
      endSeason: fallbackEnd
    }
  }

  const startSeason = Number.parseInt(meta.startSeason, 10)
  const endSeason = Number.parseInt(meta.endSeason, 10)

  if (!Number.isInteger(startSeason) || !Number.isInteger(endSeason) || startSeason > endSeason) {
    return {
      startSeason: fallbackStart,
      endSeason: fallbackEnd
    }
  }

  return {
    startSeason,
    endSeason
  }
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {
    const currentUtcYear = new Date().getUTCFullYear()
    const historicalMeta = await redis.get("mlb:games:historical:meta")
    const fallbackRange = parseMetaSeasonRange(
      historicalMeta,
      DEFAULT_START_SEASON,
      currentUtcYear
    )

    const parsedStartSeason = parseSeasonParam(
      req?.query?.startSeason,
      fallbackRange.startSeason
    )
    const parsedEndSeason = parseSeasonParam(
      req?.query?.endSeason,
      fallbackRange.endSeason
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

    const seasons = buildSeasonRange(startSeason, endSeason)

    let allGames = []

    for (const season of seasons) {
      const seasonGames = await redis.get(`mlb:games:historical:${season}`)

      if (seasonGames && seasonGames.length > 0) {
        allGames = allGames.concat(seasonGames)
      }
    }

    if (allGames.length === 0) {
      return res.status(400).json({
        error: "Historical data unavailable",
        code: "HISTORICAL_DATA_UNAVAILABLE"
      })
    }

    // Run ELO rating calculation
    const ratings = calculateElo(allGames)

    // Store ratings
    await redis.set("mlb:ratings:teams", ratings)

    res.status(200).json({
      seasonsUsed: seasons.length,
      gamesProcessed: allGames.length,
      teamsRated: Object.keys(ratings).length,
      sampleRatings: Object.entries(ratings).slice(0,5)
    })
  } catch (error) {
    return sendRouteError(res, "buildRatings", error)
  }
}
