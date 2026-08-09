import crypto from "node:crypto"

import { buildMlbScheduleUrl } from "./mlbSchedule.js"
import { normalizeOddsPayload } from "./normalizeOdds.js"
import { buildOddsApiUrl } from "./oddsApi.js"
import { validateExternalMlbSchedulePayload } from "./payloadValidation.js"
import {
  buildSavantPitcherUrl,
  SAVANT_PITCHER_REQUIRED_COLUMNS
} from "./pitcherStats.js"
import { parseCsv, parseCsvRow } from "./savantCsv.js"
import { fetchJsonWithRetry, fetchTextWithRetry } from "./upstreamFetch.js"

function sanitizedFailure(service, error, status = null) {
  const safeMessage = String(error?.message || "Validation failed")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(apiKey|token|secret)=[^\s&]+/gi, "$1=[redacted]")

  return {
    service,
    success: false,
    httpStatus: error?.status || status,
    schemaValid: false,
    error: safeMessage.slice(0, 240)
  }
}

function statusCapturingFetch(fetchImpl, state) {
  return async (...args) => {
    const response = await fetchImpl(...args)
    state.status = response.status
    return response
  }
}

async function validateRedis(redisClient) {
  const key = `mlb:validation:temporary:${crypto.randomUUID()}`
  const value = { nonce: crypto.randomUUID(), createdAt: new Date().toISOString() }
  let created = false

  let result
  try {
    const setResult = await redisClient.set(key, value, { nx: true, ex: 300 })
    created = setResult === "OK"
    if (!created) throw new Error("Temporary validation key was not created")

    const readValue = await redisClient.get(key)
    if (JSON.stringify(readValue) !== JSON.stringify(value)) {
      throw new Error("Temporary validation value did not match")
    }

    result = { service: "Upstash Redis", success: true, httpStatus: null, schemaValid: true }
  } catch (error) {
    result = sanitizedFailure("Upstash Redis", error)
  } finally {
    if (created) {
      try {
        const deleted = await redisClient.del(key)
        if (deleted !== 1) result = sanitizedFailure("Upstash Redis", new Error("Temporary validation key was not deleted"))
      } catch (error) {
        result = sanitizedFailure("Upstash Redis", new Error(`Temporary validation key cleanup failed: ${error?.message || "unknown error"}`))
      }
    }
  }

  return result
}

async function validateMlb(fetchImpl) {
  const state = { status: null }
  try {
    const payload = await fetchJsonWithRetry(buildMlbScheduleUrl(), {
      fetchImpl: statusCapturingFetch(fetchImpl, state),
      retries: 0
    })
    validateExternalMlbSchedulePayload(payload)
    if (!payload.dates.some(date => date.games.length > 0)) {
      throw new Error("MLB schedule response contained no games to validate")
    }
    return { service: "MLB Stats API", success: true, httpStatus: state.status, schemaValid: true }
  } catch (error) {
    return sanitizedFailure("MLB Stats API", error, state.status)
  }
}

async function validateSavant(fetchImpl) {
  const state = { status: null }
  try {
    const csv = await fetchTextWithRetry(buildSavantPitcherUrl(new Date().getUTCFullYear()), {
      fetchImpl: statusCapturingFetch(fetchImpl, state),
      retries: 0
    })
    const trimmed = csv.trimStart()
    if (/^\s*<!doctype html|^\s*<html/i.test(trimmed)) {
      throw new Error("Baseball Savant returned HTML instead of CSV")
    }
    const firstLine = trimmed.split(/\r?\n/, 1)[0]
    const columns = new Set(parseCsvRow(firstLine).map(value => value.trim()))
    const missing = SAVANT_PITCHER_REQUIRED_COLUMNS.filter(column => !columns.has(column))
    if (missing.length) throw new Error(`Baseball Savant CSV missing required columns: ${missing.join(", ")}`)
    if (parseCsv(csv).length === 0) throw new Error("Baseball Savant CSV contained no data rows")

    return { service: "Baseball Savant", success: true, httpStatus: state.status, schemaValid: true }
  } catch (error) {
    return sanitizedFailure("Baseball Savant", error, state.status)
  }
}

async function validateOdds(fetchImpl) {
  const state = { status: null }
  try {
    // retries: 0 guarantees this execution makes at most one billable provider request.
    const payload = await fetchJsonWithRetry(buildOddsApiUrl().toString(), {
      fetchImpl: statusCapturingFetch(fetchImpl, state),
      retries: 0
    })
    const normalized = normalizeOddsPayload(payload)
    if (payload.length === 0) throw new Error("Odds API response contained no games to validate")
    if (normalized.length === 0) throw new Error("Odds API response contained no usable h2h markets")
    return {
      service: "The Odds API",
      success: true,
      httpStatus: state.status,
      schemaValid: true,
      records: normalized.length
    }
  } catch (error) {
    return sanitizedFailure("The Odds API", error, state.status)
  }
}

export async function validateProductionIntegrations({ redisClient, fetchImpl = fetch }) {
  const results = []
  results.push(await validateRedis(redisClient))
  results.push(await validateMlb(fetchImpl))
  results.push(await validateSavant(fetchImpl))
  results.push(await validateOdds(fetchImpl))
  return results
}
