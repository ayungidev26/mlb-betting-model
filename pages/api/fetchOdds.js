// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import {
  normalizeOddsPayload,
  toCanonicalOddsRecord
} from "../../lib/normalizeOdds.js"
import { validateRecordArray, validateCanonicalOddsRecord } from "../../lib/payloadValidation.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { buildOddsApiUrl } from "../../lib/oddsApi.js"
import {
  enforceCooldown,
  enforceIpRateLimit,
  enforceJobLock,
  markCooldown,
  releaseJobLock
} from "../../lib/apiGuards.js"

const ODDS_API_URL = buildOddsApiUrl().toString()
const FETCH_ODDS_RATE_LIMIT = {
  keyPrefix: "mlb:limit:fetchOdds",
  limit: 12,
  windowSeconds: 60,
  routeName: "fetchOdds"
}
const FETCH_ODDS_LOCK = {
  key: "mlb:lock:fetchOdds",
  ttlSeconds: 120,
  routeName: "fetchOdds"
}
const FETCH_ODDS_COOLDOWN = {
  key: "mlb:cooldown:fetchOdds",
  cooldownSeconds: 30,
  routeName: "fetchOdds"
}

function normalizeStoredOddsRecords(records) {
  validateRecordArray(records, validateCanonicalOddsRecord, "Cached odds records")

  return records
    .map(record => toCanonicalOddsRecord(record))
    .filter(Boolean)
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  let lockToken = null

  try {
    if (!await enforceIpRateLimit(req, res, redis, FETCH_ODDS_RATE_LIMIT)) {
      return
    }

    const refresh = req.query.refresh === "true"

    if (refresh && !await enforceCooldown(res, redis, FETCH_ODDS_COOLDOWN)) {
      return
    }

    lockToken = await enforceJobLock(req, res, redis, FETCH_ODDS_LOCK)

    if (!lockToken) {
      return
    }

    // Prevent unnecessary API calls unless refresh requested
    if (!refresh) {
      const existing = await redis.get("mlb:odds:today")
      const cachedOdds = Array.isArray(existing)
        ? normalizeStoredOddsRecords(existing)
        : null

      if (cachedOdds?.length) {
        await redis.set("mlb:odds:today", cachedOdds)

        return res.status(200).json({
          source: "cache",
          games: cachedOdds.length,
          odds: cachedOdds.slice(0,3)
        })
      }
    }

    const response = await fetch(ODDS_API_URL, {
      headers: {
        Accept: "application/json"
      }
    })

    if (!response.ok) {
      throw new Error(`Odds API request failed with status ${response.status}`)
    }

    const data = await response.json()

    const odds = normalizeOddsPayload(data)

    await redis.set("mlb:odds:today", odds)

    if (refresh) {
      await markCooldown(
        redis,
        FETCH_ODDS_COOLDOWN.key,
        FETCH_ODDS_COOLDOWN.cooldownSeconds
      )
    }

    res.status(200).json({
      source: "api",
      games: odds.length,
      oddsSample: odds.slice(0,3)
    })
  } catch (error) {
    return sendRouteError(res, "fetchOdds", error)
  } finally {
    await releaseJobLock(redis, FETCH_ODDS_LOCK.key, lockToken)
  }
}
