import { redis } from "../../lib/upstash.js"
import { expandDateRangeInclusive } from "../../lib/evaluation.js"

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 180

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function parseOptionalIsoDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null }
  }

  if (typeof value !== "string") {
    return { ok: false, message: `${fieldName} must be a YYYY-MM-DD string` }
  }

  try {
    expandDateRangeInclusive(value, value)
    return { ok: true, value }
  } catch {
    return { ok: false, message: `${fieldName} must be a valid YYYY-MM-DD date` }
  }
}

function parseLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
    return { ok: true, value: DEFAULT_LIMIT }
  }

  const parsed = Number.parseInt(String(rawLimit), 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, message: "limit must be a positive integer" }
  }

  return { ok: true, value: Math.min(parsed, MAX_LIMIT) }
}

function shiftIsoDate(dateString, dayDelta) {
  const shifted = new Date(`${dateString}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + dayDelta)
  return shifted.toISOString().slice(0, 10)
}

function resolveAppliedDateRange({ dateFrom, dateTo, limit }) {
  const today = getTodayIsoDate()

  if (!dateFrom && !dateTo) {
    return {
      dateFrom: shiftIsoDate(today, -(limit - 1)),
      dateTo: today
    }
  }

  if (dateFrom && !dateTo) {
    return {
      dateFrom,
      dateTo: shiftIsoDate(dateFrom, limit - 1)
    }
  }

  if (!dateFrom && dateTo) {
    return {
      dateFrom: shiftIsoDate(dateTo, -(limit - 1)),
      dateTo
    }
  }

  return {
    dateFrom,
    dateTo
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  const parsedDateFrom = parseOptionalIsoDate(req?.query?.dateFrom, "dateFrom")
  if (!parsedDateFrom.ok) {
    return res.status(400).json({
      error: "Invalid query",
      code: "INVALID_QUERY",
      details: parsedDateFrom.message
    })
  }

  const parsedDateTo = parseOptionalIsoDate(req?.query?.dateTo, "dateTo")
  if (!parsedDateTo.ok) {
    return res.status(400).json({
      error: "Invalid query",
      code: "INVALID_QUERY",
      details: parsedDateTo.message
    })
  }

  const parsedLimit = parseLimit(req?.query?.limit)
  if (!parsedLimit.ok) {
    return res.status(400).json({
      error: "Invalid query",
      code: "INVALID_QUERY",
      details: parsedLimit.message
    })
  }

  const requestedDateRange = resolveAppliedDateRange({
    dateFrom: parsedDateFrom.value,
    dateTo: parsedDateTo.value,
    limit: parsedLimit.value
  })

  let dates

  try {
    dates = expandDateRangeInclusive(requestedDateRange.dateFrom, requestedDateRange.dateTo)
  } catch (error) {
    return res.status(400).json({
      error: "Invalid query",
      code: "INVALID_QUERY",
      details: error?.message || "Invalid date range"
    })
  }

  const boundedDates = dates.length > parsedLimit.value
    ? dates.slice(dates.length - parsedLimit.value)
    : dates

  const dateRangeApplied = {
    dateFrom: boundedDates[0],
    dateTo: boundedDates[boundedDates.length - 1],
    limit: parsedLimit.value
  }

  try {
    const records = await Promise.all(
      boundedDates.map(async (date) => {
        const key = `mlb:evaluation:${date}`
        const summary = await redis.get(key)

        if (!summary || typeof summary !== "object") {
          return null
        }

        return {
          ...summary,
          date: summary.date || date,
          sourceKey: key
        }
      })
    )

    const evaluations = records.filter(Boolean)

    return res.status(200).json({
      evaluations,
      metadata: {
        returnedDays: evaluations.length,
        dateRangeApplied
      }
    })
  } catch (_error) {
    return res.status(503).json({
      error: "Cached evaluation summaries are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
