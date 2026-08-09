// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { publishStatsCandidate, validateStatsCandidate } from "../../lib/statsQuality.js"
import { fetchBullpenStatsByTeam } from "../../lib/bullpenStats.js"
import {
  enforceIpRateLimit,
  enforceJobLock,
  releaseJobLock
} from "../../lib/apiGuards.js"

const FETCH_BULLPEN_STATS_RATE_LIMIT = {
  keyPrefix: "mlb:limit:fetchBullpenStats",
  limit: 6,
  windowSeconds: 60,
  routeName: "fetchBullpenStats"
}
const FETCH_BULLPEN_STATS_LOCK = {
  key: "mlb:lock:fetchBullpenStats",
  ttlSeconds: 180,
  routeName: "fetchBullpenStats"
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, FETCH_BULLPEN_STATS_RATE_LIMIT)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, FETCH_BULLPEN_STATS_LOCK)

    if (!lockToken) {
      return
    }

    const bullpenStats = await fetchBullpenStatsByTeam()
    const games = await redis.get("mlb:games:today")
    const statsMeta = {
      ...validateStatsCandidate({ kind: "bullpen", candidate: bullpenStats, games: Array.isArray(games) ? games : [] }),
      lastUpdatedAt: new Date().toISOString(), dateKey: getEasternDateKey(),
      source: "statsapi.mlb.com + baseballsavant.mlb.com",
      version: "v1",
      records: Object.keys(bullpenStats).length
    }

    const publication = await publishStatsCandidate(redis, { kind: "bullpen", candidate: bullpenStats, metadata: statsMeta })
    if (!publication.published) return res.status(503).json({ error: "Bullpen refresh failed quality gates; last-known-good cache preserved.", metadata: statsMeta })

    res.status(200).json({
      teamsCollected: Object.keys(bullpenStats).length,
      sample: Object.entries(bullpenStats).slice(0, 3),
      metadata: statsMeta
    })
  } catch (error) {
    return sendRouteError(res, "fetchBullpenStats", error)
  } finally {
    await releaseJobLock(redis, FETCH_BULLPEN_STATS_LOCK.key, lockToken)
  }
}
