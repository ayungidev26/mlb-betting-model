import { getEasternDateKey } from "./cronSchedule.js"

export const RATINGS_MAX_AGE_DAYS = 8

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function validateDatedCache({ payload, metadata, expectedDateKey = getEasternDateKey(), label, payloadDateKeys = [] }) {
  if (metadata === undefined || metadata === null) {
    return { legacy: true, dateKey: null }
  }
  if (!isPlainObject(metadata) || typeof metadata.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.dateKey)) {
    throw new Error(`${label} metadata is malformed. Refresh the upstream cache.`)
  }
  if (metadata.dateKey !== expectedDateKey) {
    throw new Error(`${label} cache stale (dateKey=${metadata.dateKey}, expected=${expectedDateKey}). Refresh the upstream cache.`)
  }
  if (metadata.status && metadata.status !== "healthy") {
    throw new Error(`${label} cache is ${metadata.status}. Refresh the upstream cache.`)
  }
  if (Array.isArray(payload) && Number.isInteger(metadata.records) && metadata.records !== payload.length) {
    throw new Error(`${label} metadata/payload record count disagreement. Refresh the upstream cache.`)
  }
  const disagreement = payloadDateKeys.filter(Boolean).some(dateKey => dateKey !== metadata.dateKey)
  if (disagreement) {
    throw new Error(`${label} metadata/payload date disagreement. Refresh the upstream cache.`)
  }
  return { legacy: false, dateKey: metadata.dateKey }
}

export function getRatingsFreshness(metadata, now = new Date()) {
  if (!isPlainObject(metadata)) return { fresh: false, reason: "metadata missing or malformed" }
  const generatedAt = new Date(metadata.generatedAt)
  const dataThrough = new Date(`${metadata.dataThrough}T23:59:59Z`)
  if (!Number.isInteger(metadata.season) || Number.isNaN(generatedAt.getTime()) || Number.isNaN(dataThrough.getTime())) {
    return { fresh: false, reason: "metadata missing generatedAt, dataThrough, or season" }
  }
  const maxAgeMs = RATINGS_MAX_AGE_DAYS * 86400000
  const clockSkewMs = 5 * 60 * 1000
  if (generatedAt.getTime() - now.getTime() > clockSkewMs || metadata.dataThrough > now.toISOString().slice(0, 10)) return { fresh: false, reason: "metadata contains a future timestamp" }
  if (now - generatedAt > maxAgeMs) return { fresh: false, reason: `ratings were generated more than ${RATINGS_MAX_AGE_DAYS} days ago` }
  // During the active season, the historical results feeding Elo must also advance.
  if (metadata.season === now.getUTCFullYear() && now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10 && now - dataThrough > maxAgeMs) {
    return { fresh: false, reason: `historical results are more than ${RATINGS_MAX_AGE_DAYS} days behind` }
  }
  return { fresh: true, reason: null }
}

export function assertFreshTeamRatings(metadata, now = new Date()) {
  const result = getRatingsFreshness(metadata, now)
  if (!result.fresh) {
    throw new Error(`Team ratings stale: ${result.reason}. Run /api/loadHistorical, then /api/buildRatings.`)
  }
  return result
}
