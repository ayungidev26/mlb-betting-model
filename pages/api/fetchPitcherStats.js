// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
import {
  buildLeaguePitchingContext,
  fetchSavantPitcherStatMap,
  getAdvancedPitcherStats,
  normalizePitcherStatRecord
} from "../../lib/pitcherStats.js"
import {
  enforceIpRateLimit,
  enforceJobLock,
  releaseJobLock
} from "../../lib/apiGuards.js"

const FETCH_PITCHER_STATS_RATE_LIMIT = {
  keyPrefix: "mlb:limit:fetchPitcherStats",
  limit: 6,
  windowSeconds: 60,
  routeName: "fetchPitcherStats"
}
const FETCH_PITCHER_STATS_LOCK = {
  key: "mlb:lock:fetchPitcherStats",
  ttlSeconds: 180,
  routeName: "fetchPitcherStats"
}

async function fetchTeamPitchingStats() {
  const teamsUrl = "https://statsapi.mlb.com/api/v1/teams?sportId=1"
  const teamsData = await fetchJsonWithRetry(teamsUrl)
  const teamStats = []

  for (const team of teamsData.teams || []) {
    try {
      const statsUrl =
        `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=season&group=pitching`

      const statsData = await fetchJsonWithRetry(statsUrl)
      const stat = statsData.stats?.[0]?.splits?.[0]?.stat

      if (stat) {
        teamStats.push(stat)
      }
    } catch (error) {
      console.warn(
        "fetchPitcherStats: unable to fetch team pitching stats",
        team?.id,
        error?.message || error
      )
    }
  }

  return teamStats
}

async function resolvePitcherDirectory(games) {
  const pitcherDirectory = {}

  for (const game of games) {
    const pitchers = [
      game.homePitcher,
      game.awayPitcher
    ]

    for (const name of pitchers) {
      if (!name || pitcherDirectory[name]) {
        continue
      }

      const searchUrl =
        `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`
      let searchData = null

      try {
        searchData = await fetchJsonWithRetry(searchUrl)
      } catch (error) {
        console.warn(
          "fetchPitcherStats: unable to resolve pitcher",
          name,
          error?.message || error
        )
        continue
      }

      if (!searchData.people || searchData.people.length === 0) {
        continue
      }

      pitcherDirectory[name] = {
        id: searchData.people[0].id,
        name: searchData.people[0].fullName || name,
        throwingHand: searchData.people[0].pitchHand?.code || null
      }
    }
  }

  return pitcherDirectory
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, FETCH_PITCHER_STATS_RATE_LIMIT)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, FETCH_PITCHER_STATS_LOCK)

    if (!lockToken) {
      return
    }

    const games = await redis.get("mlb:games:today")

    if (!games || games.length === 0) {
      return res.status(200).json({
        message: "No games found"
      })
    }

    const pitcherStats = {}
    const season = new Date().getUTCFullYear()
    const pitcherDirectory = await resolvePitcherDirectory(games)
    const teamPitchingStats = await fetchTeamPitchingStats()
    const leagueContext = buildLeaguePitchingContext(teamPitchingStats)

    let savantPitcherStats = null

    try {
      savantPitcherStats = await fetchSavantPitcherStatMap(season)
    } catch (error) {
      console.warn("fetchPitcherStats: unable to load Baseball Savant metrics", error?.message || error)
    }

    for (const [requestedName, pitcherMeta] of Object.entries(pitcherDirectory)) {
      try {
        const statsUrl =
          `https://statsapi.mlb.com/api/v1/people/${pitcherMeta.id}/stats?stats=season&group=pitching`
        const statsData = await fetchJsonWithRetry(statsUrl)
        const stat = statsData.stats?.[0]?.splits?.[0]?.stat

        if (!stat) {
          continue
        }

        const advancedStat = getAdvancedPitcherStats(
          pitcherMeta.id,
          pitcherMeta.name,
          savantPitcherStats
        )

        pitcherStats[requestedName] = {
          pitcherId: pitcherMeta.id,
          throwingHand: pitcherMeta.throwingHand || null,
          ...normalizePitcherStatRecord(stat, advancedStat, leagueContext)
        }
      } catch (error) {
        console.warn(
          "fetchPitcherStats: unable to fetch pitcher",
          pitcherMeta?.name || requestedName,
          error?.message || error
        )
      }
    }

    await redis.set("mlb:stats:pitchers", pitcherStats)

    res.status(200).json({
      pitchersCollected: Object.keys(pitcherStats).length,
      sample: Object.entries(pitcherStats).slice(0, 3)
    })
  } catch (error) {
    return sendRouteError(res, "fetchPitcherStats", error)
  } finally {
    await releaseJobLock(redis, FETCH_PITCHER_STATS_LOCK.key, lockToken)
  }
}
