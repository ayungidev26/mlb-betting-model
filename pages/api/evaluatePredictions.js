// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { buildMatchKey } from "../../lib/matchKey.js"
import { evaluatePredictions, expandDateRangeInclusive } from "../../lib/evaluation.js"

function parsePersist(rawPersist) {
  if (rawPersist === undefined || rawPersist === null) {
    return { ok: true, value: true }
  }

  if (typeof rawPersist === "boolean") {
    return { ok: true, value: rawPersist }
  }

  if (typeof rawPersist === "string") {
    const normalized = rawPersist.trim().toLowerCase()

    if (normalized === "true") {
      return { ok: true, value: true }
    }

    if (normalized === "false") {
      return { ok: true, value: false }
    }
  }

  return {
    ok: false,
    message: "persist must be a boolean"
  }
}

function parseDateRange(body = {}) {
  const dateFrom = body?.dateFrom
  const dateTo = body?.dateTo

  if (typeof dateFrom !== "string" || typeof dateTo !== "string") {
    return {
      ok: false,
      message: "dateFrom and dateTo are required as YYYY-MM-DD strings"
    }
  }

  try {
    const dates = expandDateRangeInclusive(dateFrom, dateTo)

    return {
      ok: true,
      dateFrom,
      dateTo,
      dates
    }
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Invalid date range"
    }
  }
}

function summarizeUnmatched(unmatchedRecords = []) {
  const byReason = {}
  const byType = {}

  for (const record of unmatchedRecords) {
    const reason = record?.reason || "unknown"
    const type = record?.type || "unknown"

    byReason[reason] = (byReason[reason] || 0) + 1
    byType[type] = (byType[type] || 0) + 1
  }

  return {
    total: unmatchedRecords.length,
    byReason,
    byType
  }
}

function mergeUnmatchedStats(targetStats, sourceStats) {
  targetStats.total += sourceStats.total

  for (const [reason, count] of Object.entries(sourceStats.byReason)) {
    targetStats.byReason[reason] = (targetStats.byReason[reason] || 0) + count
  }

  for (const [type, count] of Object.entries(sourceStats.byType)) {
    targetStats.byType[type] = (targetStats.byType[type] || 0) + count
  }
}

function getSeasonFromDate(dateKey) {
  return Number.parseInt(String(dateKey).slice(0, 4), 10)
}

function normalizeFinalResultRecord(record) {
  const explicitMatchKey = record?.matchKey

  if (explicitMatchKey) {
    return {
      ...record,
      matchKey: explicitMatchKey
    }
  }

  const computedMatchKey = buildMatchKey(record?.date, record?.awayTeam, record?.homeTeam)

  return {
    ...record,
    matchKey: computedMatchKey
  }
}

/**
 * Operational endpoint that evaluates stored daily predictions against historical finals.
 *
 * Request body:
 *   {
 *     "dateFrom": "YYYY-MM-DD", // required
 *     "dateTo": "YYYY-MM-DD",   // required
 *     "persist": true             // optional, defaults to true
 *   }
 *
 * Redis keys:
 *   - reads predictions: mlb:predictions:<date>
 *   - reads history:     mlb:games:historical:<season>
 *   - writes summary:    mlb:evaluation:<date> (when persist !== false)
 */
export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {
    const parsedDateRange = parseDateRange(req?.body)

    if (!parsedDateRange.ok) {
      return res.status(400).json({
        error: "Invalid request body",
        code: "INVALID_REQUEST_BODY",
        details: parsedDateRange.message
      })
    }

    const parsedPersist = parsePersist(req?.body?.persist)

    if (!parsedPersist.ok) {
      return res.status(400).json({
        error: "Invalid request body",
        code: "INVALID_REQUEST_BODY",
        details: parsedPersist.message
      })
    }

    const seasonSet = new Set(parsedDateRange.dates.map(getSeasonFromDate))
    const historicalBySeason = new Map()

    for (const season of seasonSet) {
      const seasonGames = await redis.get(`mlb:games:historical:${season}`)
      historicalBySeason.set(season, Array.isArray(seasonGames) ? seasonGames : [])
    }

    const aggregate = {
      gamesPredicted: 0,
      gamesMatchedToFinal: 0,
      correctPredictions: 0,
      brierNumerator: 0
    }

    const aggregateUnmatched = {
      total: 0,
      byReason: {},
      byType: {}
    }

    const perDay = []

    for (const dateKey of parsedDateRange.dates) {
      const season = getSeasonFromDate(dateKey)
      const seasonResults = historicalBySeason.get(season) || []
      const dateResults = seasonResults
        .filter((game) => typeof game?.date === "string" && game.date.slice(0, 10) === dateKey)
        .map(normalizeFinalResultRecord)

      const predictions = await redis.get(`mlb:predictions:${dateKey}`)
      const normalizedPredictions = Array.isArray(predictions) ? predictions.map((prediction) => ({ ...prediction })) : []

      const evaluation = evaluatePredictions(normalizedPredictions, dateResults)
      const unmatchedStats = summarizeUnmatched(evaluation.unmatchedRecords)

      aggregate.gamesPredicted += evaluation.metrics.gamesPredicted
      aggregate.gamesMatchedToFinal += evaluation.metrics.gamesMatchedToFinal
      aggregate.correctPredictions += evaluation.matchedRecords.filter((record) => record.correct).length
      aggregate.brierNumerator += evaluation.metrics.brierScore * evaluation.metrics.gamesMatchedToFinal
      mergeUnmatchedStats(aggregateUnmatched, unmatchedStats)

      const daySummary = {
        date: dateKey,
        season,
        sourceKeys: {
          predictions: `mlb:predictions:${dateKey}`,
          historical: `mlb:games:historical:${season}`
        },
        metrics: evaluation.metrics,
        unmatchedStats,
        generatedAt: new Date().toISOString()
      }

      if (parsedPersist.value) {
        await redis.set(`mlb:evaluation:${dateKey}`, daySummary)
      }

      perDay.push(daySummary)
    }

    const gamesMatchedToFinal = aggregate.gamesMatchedToFinal

    return res.status(200).json({
      ok: true,
      dateRange: {
        dateFrom: parsedDateRange.dateFrom,
        dateTo: parsedDateRange.dateTo,
        totalDays: parsedDateRange.dates.length
      },
      persist: parsedPersist.value,
      aggregate: {
        gamesPredicted: aggregate.gamesPredicted,
        gamesMatchedToFinal,
        coverageRate: aggregate.gamesPredicted === 0 ? 0 : gamesMatchedToFinal / aggregate.gamesPredicted,
        accuracy: gamesMatchedToFinal === 0 ? 0 : aggregate.correctPredictions / gamesMatchedToFinal,
        brierScore: gamesMatchedToFinal === 0 ? 0 : aggregate.brierNumerator / gamesMatchedToFinal
      },
      unmatchedStats: aggregateUnmatched,
      perDay
    })
  } catch (error) {
    return sendRouteError(res, "evaluatePredictions", error)
  }
}
