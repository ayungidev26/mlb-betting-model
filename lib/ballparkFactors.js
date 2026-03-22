import { BALLPARK_FACTOR_BASELINES, BALLPARK_FACTOR_SOURCE } from "../data/ballparkFactors.js"
import { fetchJsonWithRetry, fetchTextWithRetry } from "./upstreamFetch.js"

export const DEFAULT_BALLPARK_FACTOR = 1
export const PITCHER_FRIENDLY_MAX = 0.95
export const HITTER_FRIENDLY_MIN = 1.05
const EXTERNAL_BALLPARK_FACTORS_URL = process.env.BALLPARK_FACTORS_URL || ""

function roundFactor(value) {
  return Number((value ?? DEFAULT_BALLPARK_FACTOR).toFixed(3))
}

function normalizeLookupValue(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : ""
}

function normalizeFactorValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 5 ? roundFactor(value / 100) : roundFactor(value)
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed)
      ? normalizeFactorValue(parsed)
      : DEFAULT_BALLPARK_FACTOR
  }

  return DEFAULT_BALLPARK_FACTOR
}

function deriveClassification(runFactor) {
  if (runFactor < PITCHER_FRIENDLY_MAX) {
    return "pitcher-friendly"
  }

  if (runFactor > HITTER_FRIENDLY_MIN) {
    return "hitter-friendly"
  }

  return "neutral"
}

function normalizeRecord(record = {}, source = BALLPARK_FACTOR_SOURCE) {
  const venue = record.venue || record.venueName || record.ballpark || null
  const homeTeams = Array.isArray(record.homeTeams)
    ? record.homeTeams.filter(Boolean)
    : (record.team || record.homeTeam ? [record.team || record.homeTeam] : [])
  const aliases = Array.isArray(record.aliases) ? record.aliases.filter(Boolean) : []
  const runFactor = normalizeFactorValue(record.runFactor ?? record.runs ?? record.run)
  const homeRunFactor = normalizeFactorValue(record.homeRunFactor ?? record.hrFactor ?? record.homeRuns ?? record.hr)
  const hitsFactor = normalizeFactorValue(record.hitsFactor ?? record.hits)
  const doublesTriplesFactor = normalizeFactorValue(
    record.doublesTriplesFactor ?? record.doublesTriples ?? record.xbhFactor ?? record.extraBaseHits
  )
  const leftHandedHitterFactor = normalizeFactorValue(
    record.leftHandedHitterFactor ?? record.leftyFactor ?? record.leftHanded ?? record.left
  )
  const rightHandedHitterFactor = normalizeFactorValue(
    record.rightHandedHitterFactor ?? record.rightyFactor ?? record.rightHanded ?? record.right
  )

  return {
    venue,
    aliases,
    homeTeams,
    source: source.name,
    season: source.season || null,
    runFactor,
    homeRunFactor,
    hitsFactor,
    doublesTriplesFactor,
    leftHandedHitterFactor,
    rightHandedHitterFactor,
    classification: deriveClassification(runFactor),
    isFallback: source === BALLPARK_FACTOR_SOURCE
  }
}

function splitCsvLine(line = "") {
  const cells = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === "," && !inQuotes) {
      cells.push(current)
      current = ""
      continue
    }

    current += character
  }

  cells.push(current)
  return cells.map((cell) => cell.trim())
}

function parseCsvRecords(text = "") {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = splitCsvLine(lines[0])

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? ""
      return record
    }, {})
  })
}

async function fetchExternalBallparkFactors() {
  if (!EXTERNAL_BALLPARK_FACTORS_URL) {
    return null
  }

  const isCsv = /\.csv(?:\?|$)/i.test(EXTERNAL_BALLPARK_FACTORS_URL)
  const payload = isCsv
    ? parseCsvRecords(await fetchTextWithRetry(EXTERNAL_BALLPARK_FACTORS_URL))
    : await fetchJsonWithRetry(EXTERNAL_BALLPARK_FACTORS_URL)

  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.ballparks)
      ? payload.ballparks
      : Array.isArray(payload?.data)
        ? payload.data
        : []

  if (records.length === 0) {
    return null
  }

  const source = {
    name: `External ballpark factors (${EXTERNAL_BALLPARK_FACTORS_URL})`,
    season: payload?.season || null
  }

  return records.map((record) => normalizeRecord(record, source))
}

let cachedBallparkFactorRecordsPromise = null

async function loadBallparkFactorRecords() {
  if (!cachedBallparkFactorRecordsPromise) {
    cachedBallparkFactorRecordsPromise = (async () => {
      try {
        const externalRecords = await fetchExternalBallparkFactors()
        if (externalRecords?.length) {
          return externalRecords
        }
      } catch (_error) {
        // Fall back to the bundled baseline when the optional external feed is unavailable.
      }

      return BALLPARK_FACTOR_BASELINES.map((record) => normalizeRecord(record))
    })()
  }

  return cachedBallparkFactorRecordsPromise
}

export async function getBallparkFactorIndex() {
  const records = await loadBallparkFactorRecords()

  return records.reduce((index, record) => {
    if (record.venue) {
      index.byVenue.set(normalizeLookupValue(record.venue), record)
    }

    for (const alias of record.aliases || []) {
      index.byVenue.set(normalizeLookupValue(alias), record)
    }

    for (const teamName of record.homeTeams || []) {
      index.byTeam.set(normalizeLookupValue(teamName), record)
    }

    return index
  }, {
    records,
    source: records[0]?.source || BALLPARK_FACTOR_SOURCE.name,
    byVenue: new Map(),
    byTeam: new Map()
  })
}

export async function resolveBallparkFactors({ venue = null, homeTeam = null } = {}, providedIndex = null) {
  const index = providedIndex || await getBallparkFactorIndex()
  const venueKey = normalizeLookupValue(venue)
  const teamKey = normalizeLookupValue(homeTeam)
  const matchedRecord =
    (venueKey ? index.byVenue.get(venueKey) : null) ||
    (teamKey ? index.byTeam.get(teamKey) : null) ||
    null

  if (matchedRecord) {
    return {
      ...matchedRecord,
      venue: venue || matchedRecord.venue,
      isUnknown: false
    }
  }

  return {
    venue: venue || null,
    aliases: [],
    homeTeams: homeTeam ? [homeTeam] : [],
    source: index.source,
    season: null,
    runFactor: DEFAULT_BALLPARK_FACTOR,
    homeRunFactor: DEFAULT_BALLPARK_FACTOR,
    hitsFactor: DEFAULT_BALLPARK_FACTOR,
    doublesTriplesFactor: DEFAULT_BALLPARK_FACTOR,
    leftHandedHitterFactor: DEFAULT_BALLPARK_FACTOR,
    rightHandedHitterFactor: DEFAULT_BALLPARK_FACTOR,
    classification: deriveClassification(DEFAULT_BALLPARK_FACTOR),
    isFallback: true,
    isUnknown: true
  }
}

export function getBallparkHandednessFactor(ballpark = null, opposingPitcherHand = null) {
  if (!ballpark) {
    return DEFAULT_BALLPARK_FACTOR
  }

  // We use the opposing starter's handedness as a proxy for which side of the lineup is most likely to see the
  // bulk of the plate appearances with the platoon advantage when same-day lineups are unavailable.
  if (opposingPitcherHand === "R") {
    return ballpark.leftHandedHitterFactor || ballpark.runFactor || DEFAULT_BALLPARK_FACTOR
  }

  if (opposingPitcherHand === "L") {
    return ballpark.rightHandedHitterFactor || ballpark.runFactor || DEFAULT_BALLPARK_FACTOR
  }

  return ballpark.runFactor || DEFAULT_BALLPARK_FACTOR
}

export function getBallparkDisplayLabel(ballpark = null) {
  if (!ballpark?.venue) {
    return "Unknown park"
  }

  return `${ballpark.venue} (${ballpark.classification || "neutral"})`
}
