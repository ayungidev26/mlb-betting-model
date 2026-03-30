// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
import {
  buildLeaguePitchingContext,
  fetchSavantPitcherStatMap,
  getAdvancedPitcherStats,
  normalizePitcherStatRecord,
  parseInningsPitched
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

const PITCHER_PAGE_LIMIT = 1000
const PEOPLE_BATCH_SIZE = 100
const LOW_FETCHED_PITCHERS_THRESHOLD = 200
const SAVED_DELTA_WARNING_THRESHOLD = 0.15

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

async function fetchAllPitchingStatSplits(season) {
  const splits = []
  let offset = 0

  while (true) {
    const statsUrl =
      `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${season}&sportIds=1&playerPool=ALL&limit=${PITCHER_PAGE_LIMIT}&offset=${offset}`

    const statsData = await fetchJsonWithRetry(statsUrl)
    const pageSplits = statsData.stats?.[0]?.splits || []

    if (pageSplits.length === 0) {
      break
    }

    splits.push(...pageSplits)

    if (pageSplits.length < PITCHER_PAGE_LIMIT) {
      break
    }

    offset += pageSplits.length
  }

  return splits
}

async function fetchPitcherMetadataById(pitcherIds = []) {
  const metadataById = {}

  for (let index = 0; index < pitcherIds.length; index += PEOPLE_BATCH_SIZE) {
    const batch = pitcherIds.slice(index, index + PEOPLE_BATCH_SIZE)

    if (batch.length === 0) {
      continue
    }

    try {
      const peopleUrl = `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(",")}`
      const peopleData = await fetchJsonWithRetry(peopleUrl)

      for (const person of peopleData.people || []) {
        metadataById[String(person.id)] = {
          throwingHand: person?.pitchHand?.code || null,
          active: typeof person?.active === "boolean" ? person.active : null,
          fullName: person?.fullName || null,
          teamName: person?.currentTeam?.name || null,
          teamAbbr: person?.currentTeam?.abbreviation || null
        }
      }
    } catch (error) {
      console.warn(
        "fetchPitcherStats: unable to fetch pitcher metadata batch",
        batch.length,
        error?.message || error
      )
    }
  }

  return metadataById
}

function dedupePitcherSplits(splits = []) {
  const dedupedById = new Map()
  let missingStatsCount = 0
  let duplicateCount = 0

  for (const split of splits) {
    const playerId = split?.player?.id
    const stat = split?.stat

    if (!playerId || !stat) {
      missingStatsCount += 1
      continue
    }

    const key = String(playerId)

    if (!dedupedById.has(key)) {
      dedupedById.set(key, split)
      continue
    }

    duplicateCount += 1

    const existing = dedupedById.get(key)
    const existingInnings = parseInningsPitched(existing?.stat?.inningsPitched) || 0
    const incomingInnings = parseInningsPitched(stat?.inningsPitched) || 0

    if (incomingInnings > existingInnings) {
      dedupedById.set(key, split)
    }
  }

  return {
    dedupedSplits: Array.from(dedupedById.values()),
    missingStatsCount,
    duplicateCount
  }
}

function buildPitcherStatsFromSplits({
  splits,
  pitcherMetadataById,
  savantPitcherStats,
  leagueContext
}) {
  const pitchersById = {}
  const pitcherNameAliasMap = {}
  const savedPitcherIds = new Set()
  let inactivePitchers = 0
  let duplicateNameCollisions = 0

  for (const split of splits) {
    const playerId = split?.player?.id
    const stat = split?.stat

    if (!playerId || !stat) {
      continue
    }

    const playerIdKey = String(playerId)
    const metadata = pitcherMetadataById[playerIdKey] || null

    if (metadata?.active === false) {
      inactivePitchers += 1
    }

    const pitcherName =
      split?.player?.fullName ||
      metadata?.fullName ||
      `Pitcher ${playerIdKey}`
    const teamName = split?.team?.name || metadata?.teamName || null
    const teamAbbr = split?.team?.abbreviation || metadata?.teamAbbr || null

    const advancedStat = getAdvancedPitcherStats(
      playerId,
      pitcherName,
      savantPitcherStats
    )

    pitchersById[playerIdKey] = {
      pitcherId: playerId,
      pitcherName,
      fullName: pitcherName,
      teamName,
      teamAbbr,
      throwingHand: metadata?.throwingHand || null,
      ...normalizePitcherStatRecord(stat, advancedStat, leagueContext)
    }
    const existingAliasIds = pitcherNameAliasMap[pitcherName] || []

    if (existingAliasIds.length > 0) {
      duplicateNameCollisions += 1
    }

    pitcherNameAliasMap[pitcherName] = [...existingAliasIds, playerId]

    savedPitcherIds.add(playerIdKey)
  }

  const pitcherStats = {
    version: "v3",
    byId: pitchersById,
    aliasMap: pitcherNameAliasMap
  }

  return {
    pitcherStats,
    savedPitchers: savedPitcherIds.size,
    inactivePitchers,
    duplicateNameCollisions
  }
}

async function savePitcherStats(redisClient, pitcherStats, statsMeta) {
  await redisClient.set("mlb:stats:pitchers", pitcherStats)
  await redisClient.set("mlb:stats:pitchers:meta", statsMeta)
}

function logPitcherPipelineWarnings({ pitchersFetched, pitchersSaved }) {
  if (pitchersFetched < LOW_FETCHED_PITCHERS_THRESHOLD) {
    console.warn("fetchPitcherStats: unusually low pitcher fetch count", {
      pitchersFetched,
      threshold: LOW_FETCHED_PITCHERS_THRESHOLD
    })
  }

  const dropoffRate = pitchersFetched > 0
    ? (pitchersFetched - pitchersSaved) / pitchersFetched
    : 0

  if (dropoffRate >= SAVED_DELTA_WARNING_THRESHOLD) {
    console.warn("fetchPitcherStats: pitchers saved differs significantly from fetched", {
      pitchersFetched,
      pitchersSaved,
      dropoffRate: Number(dropoffRate.toFixed(3)),
      threshold: SAVED_DELTA_WARNING_THRESHOLD
    })
  }
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

    const season = new Date().getUTCFullYear()
    const teamPitchingStats = await fetchTeamPitchingStats()
    const leagueContext = buildLeaguePitchingContext(teamPitchingStats)

    let savantPitcherStats = null

    try {
      savantPitcherStats = await fetchSavantPitcherStatMap(season)
    } catch (error) {
      console.warn("fetchPitcherStats: unable to load Baseball Savant metrics", error?.message || error)
    }

    const rawPitcherSplits = await fetchAllPitchingStatSplits(season)
    const {
      dedupedSplits,
      missingStatsCount,
      duplicateCount
    } = dedupePitcherSplits(rawPitcherSplits)

    const pitcherIds = dedupedSplits
      .map(split => split?.player?.id)
      .filter(Boolean)

    const pitcherMetadataById = await fetchPitcherMetadataById(pitcherIds)

    const {
      pitcherStats,
      savedPitchers,
      inactivePitchers,
      duplicateNameCollisions
    } = buildPitcherStatsFromSplits({
      splits: dedupedSplits,
      pitcherMetadataById,
      savantPitcherStats,
      leagueContext
    })

    const sample = Object.values(pitcherStats?.byId || {}).slice(0, 3)
    const pitchersFetched = rawPitcherSplits.length
    const pitchersSaved = savedPitchers
    const statsMeta = {
      lastUpdatedAt: new Date().toISOString(),
      source: "statsapi.mlb.com + baseballsavant.mlb.com",
      version: "v2",
      season,
      records: Object.keys(pitcherStats?.byId || {}).length,
      fetchedPitchers: pitchersFetched,
      pitchersFetched,
      dedupedPitchers: dedupedSplits.length,
      duplicatePitchers: duplicateCount,
      duplicateNameCollisions,
      missingStats: missingStatsCount,
      inactivePitchers,
      savedPitchers: pitchersSaved,
      pitchersSaved
    }

    await savePitcherStats(redis, pitcherStats, statsMeta)
    logPitcherPipelineWarnings({ pitchersFetched, pitchersSaved })

    console.info("fetchPitcherStats summary", {
      pitchersFetched,
      dedupedPitchers: dedupedSplits.length,
      pitchersSaved,
      missingStatsCount,
      duplicateCount,
      duplicateNameCollisions,
      inactivePitchers,
      sample
    })

    res.status(200).json({
      pitchersFetched,
      pitchersSaved,
      sample,
      metadata: statsMeta
    })
  } catch (error) {
    return sendRouteError(res, "fetchPitcherStats", error)
  } finally {
    await releaseJobLock(redis, FETCH_PITCHER_STATS_LOCK.key, lockToken)
  }
}
