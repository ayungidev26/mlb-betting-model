// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
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

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, LOAD_HISTORICAL_RATE_LIMIT)) {
      return
    }

    if (!await enforceCooldown(res, redis, LOAD_HISTORICAL_COOLDOWN)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, LOAD_HISTORICAL_LOCK)

    if (!lockToken) {
      return
    }

    const seasons = [
      2015,2016,2017,2018,2019,
      2020,2021,2022,2023,2024,2025
    ]

    const MLB_TEAMS = [
      "Arizona Diamondbacks",
      "Atlanta Braves",
      "Baltimore Orioles",
      "Boston Red Sox",
      "Chicago Cubs",
      "Chicago White Sox",
      "Cincinnati Reds",
      "Cleveland Guardians",
      "Colorado Rockies",
      "Detroit Tigers",
      "Houston Astros",
      "Kansas City Royals",
      "Los Angeles Angels",
      "Los Angeles Dodgers",
      "Miami Marlins",
      "Milwaukee Brewers",
      "Minnesota Twins",
      "New York Mets",
      "New York Yankees",
      "Oakland Athletics",
      "Philadelphia Phillies",
      "Pittsburgh Pirates",
      "San Diego Padres",
      "San Francisco Giants",
      "Seattle Mariners",
      "St. Louis Cardinals",
      "Tampa Bay Rays",
      "Texas Rangers",
      "Toronto Blue Jays",
      "Washington Nationals"
    ]

    let totalGames = 0
    const seasonGamesByKey = new Map()

    for (const season of seasons) {
      const url =
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}`

      const data = await fetchJsonWithRetry(url)
      const seasonGames = []

      if (!data.dates) {
        seasonGamesByKey.set(`mlb:games:historical:${season}`, seasonGames)
        continue
      }

      for (const date of data.dates) {
        for (const game of date.games) {
          // Only final games
          if (game.status.detailedState !== "Final") continue

          // Ignore spring training
          if (game.gameType === "S") continue

          const homeTeam = game.teams.home.team.name
          const awayTeam = game.teams.away.team.name

          // Ignore non-MLB teams
          if (!MLB_TEAMS.includes(homeTeam)) continue
          if (!MLB_TEAMS.includes(awayTeam)) continue

          let seasonType = "regular"

          if (["P","F","D","L","W"].includes(game.gameType)) {
            seasonType = "playoffs"
          }

          seasonGames.push({
            season: season,
            date: game.gameDate,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            homeScore: game.teams.home.score,
            awayScore: game.teams.away.score,
            seasonType: seasonType
          })
        }
      }

      seasonGamesByKey.set(`mlb:games:historical:${season}`, seasonGames)
      totalGames += seasonGames.length
    }

    for (const [key, seasonGames] of seasonGamesByKey.entries()) {
      await redis.set(key, seasonGames)
    }

    await markCooldown(
      redis,
      LOAD_HISTORICAL_COOLDOWN.key,
      LOAD_HISTORICAL_COOLDOWN.cooldownSeconds
    )

    res.status(200).json({
      seasonsLoaded: seasons.length,
      gamesCollected: totalGames
    })
  } catch (error) {
    return sendRouteError(res, "loadHistorical", error)
  } finally {
    await releaseJobLock(redis, LOAD_HISTORICAL_LOCK.key, lockToken)
  }
}
