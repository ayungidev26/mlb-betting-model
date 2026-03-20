// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import {
  normalizeOddsPayload,
  toCanonicalOddsRecord
} from "../../lib/normalizeOdds"
import { validateRecordArray, validateCanonicalOddsRecord } from "../../lib/payloadValidation"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"
import { sendRouteError } from "../../lib/apiErrors"
import { buildOddsApiUrl } from "../../lib/oddsApi"

const ODDS_API_URL = buildOddsApiUrl().toString()

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

  try {


    // Prevent unnecessary API calls unless refresh requested
    const refresh = req.query.refresh === "true"

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

    res.status(200).json({
      source: "api",
      games: odds.length,
      oddsSample: odds.slice(0,3)
    })

  } catch (error) {
    return sendRouteError(res, "fetchOdds", error)
  }

}
