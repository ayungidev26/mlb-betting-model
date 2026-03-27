// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { fetchTeamOffenseStatsByTeam } from "../../lib/offenseStats.js"
import {
  enforceIpRateLimit,
  enforceJobLock,
  releaseJobLock
} from "../../lib/apiGuards.js"

const FETCH_TEAM_OFFENSE_STATS_RATE_LIMIT = {
  keyPrefix: "mlb:limit:fetchTeamOffenseStats",
  limit: 6,
  windowSeconds: 60,
  routeName: "fetchTeamOffenseStats"
}
const FETCH_TEAM_OFFENSE_STATS_LOCK = {
  key: "mlb:lock:fetchTeamOffenseStats",
  ttlSeconds: 240,
  routeName: "fetchTeamOffenseStats"
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, FETCH_TEAM_OFFENSE_STATS_RATE_LIMIT)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, FETCH_TEAM_OFFENSE_STATS_LOCK)

    if (!lockToken) {
      return
    }

    const offenseStats = await fetchTeamOffenseStatsByTeam()

    const statsMeta = {
      lastUpdatedAt: new Date().toISOString(),
      source: "statsapi.mlb.com + baseballsavant.mlb.com",
      version: "v1",
      records: Object.keys(offenseStats).length
    }

    await redis.set("mlb:stats:offense", offenseStats)
    await redis.set("mlb:stats:offense:meta", statsMeta)

    res.status(200).json({
      teamsCollected: Object.keys(offenseStats).length,
      sample: Object.entries(offenseStats).slice(0, 3),
      metadata: statsMeta
    })
  } catch (error) {
    return sendRouteError(res, "fetchTeamOffenseStats", error)
  } finally {
    await releaseJobLock(redis, FETCH_TEAM_OFFENSE_STATS_LOCK.key, lockToken)
  }
}
