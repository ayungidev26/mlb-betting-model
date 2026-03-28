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
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
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
const STARTED_GAME_BUFFER_MS = 2 * 60 * 1000

function normalizeStoredOddsRecords(records) {
  validateRecordArray(records, validateCanonicalOddsRecord, "Cached odds records")

  return records
    .map(record => toCanonicalOddsRecord(record))
    .filter(Boolean)
}

function parseCommenceTimeMillis(commenceTime) {
  const millis = Date.parse(commenceTime)

  return Number.isFinite(millis)
    ? millis
    : null
}

function isStartedGame(commenceTime, nowMillis) {
  const commenceMillis = parseCommenceTimeMillis(commenceTime)

  if (commenceMillis === null) {
    return null
  }

  return commenceMillis <= (nowMillis - STARTED_GAME_BUFFER_MS)
}

function dedupeByMatchKey(records) {
  const byMatchKey = new Map()

  for (const record of records) {
    byMatchKey.set(record.matchKey, record)
  }

  return Array.from(byMatchKey.values())
}

// Merge policy for refresh=true:
// - started games are preserved from cache to avoid replacing in-progress lines;
// - upcoming games are refreshed from latest fetched payload;
// - invalid/undated records are dropped from merge output.
function buildSelectiveRefreshOdds(existingOdds, fetchedOdds, nowMillis = Date.now()) {
  if (!existingOdds.length) {
    return {
      odds: fetchedOdds,
      updatedUpcoming: fetchedOdds.length,
      preservedStarted: 0,
      droppedInvalid: 0
    }
  }

  const startedCachedOdds = []
  let droppedInvalid = 0

  for (const cachedRecord of dedupeByMatchKey(existingOdds)) {
    const started = isStartedGame(cachedRecord.commenceTime, nowMillis)

    if (started === null) {
      droppedInvalid += 1
      continue
    }

    if (started) {
      startedCachedOdds.push(cachedRecord)
    }
  }

  const upcomingFetchedOdds = []

  for (const fetchedRecord of dedupeByMatchKey(fetchedOdds)) {
    const started = isStartedGame(fetchedRecord.commenceTime, nowMillis)

    if (started === null) {
      droppedInvalid += 1
      continue
    }

    if (!started) {
      upcomingFetchedOdds.push(fetchedRecord)
    }
  }

  return {
    odds: [
      ...startedCachedOdds,
      ...upcomingFetchedOdds
    ],
    updatedUpcoming: upcomingFetchedOdds.length,
    preservedStarted: startedCachedOdds.length,
    droppedInvalid
  }
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

    const existing = await redis.get("mlb:odds:today")
    const cachedOdds = Array.isArray(existing)
      ? normalizeStoredOddsRecords(existing)
      : []
    const data = await fetchJsonWithRetry(ODDS_API_URL)
    const fetchedOdds = normalizeOddsPayload(data)
    const mergedRefresh = refresh
      ? buildSelectiveRefreshOdds(cachedOdds, fetchedOdds)
      : null
    const odds = mergedRefresh
      ? mergedRefresh.odds
      : fetchedOdds

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
      oddsSample: odds.slice(0,3),
      ...(refresh ? {
        refreshMode: "selective",
        updatedUpcoming: mergedRefresh.updatedUpcoming,
        preservedStarted: mergedRefresh.preservedStarted,
        droppedInvalid: mergedRefresh.droppedInvalid
      } : {})
    })
  } catch (error) {
    return sendRouteError(res, "fetchOdds", error)
  } finally {
    await releaseJobLock(redis, FETCH_ODDS_LOCK.key, lockToken)
  }
}
