import { fetchTextWithRetry } from "./upstreamFetch.js"

const PERCENT_SCALE_THRESHOLD = 1
const FIP_CONSTANT_FALLBACK = 3.2
const MINIMUM_HR_PER_FLY_BALL_RATE = 0.05

export const PITCHER_PERCENTAGE_FIELDS = [
  "strikeoutRate",
  "walkRate",
  "strikeoutMinusWalkRate",
  "hardHitRate",
  "barrelRate"
]

function parseNumericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = Number.parseFloat(String(value).replace(/%/g, "").trim())

  return Number.isFinite(parsed) ? parsed : null
}

export function parseInningsPitched(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const normalized = String(value).trim()

  if (!normalized.includes(".")) {
    return parseNumericValue(normalized)
  }

  const [wholeInnings, outs] = normalized.split(".")
  const whole = Number.parseInt(wholeInnings, 10)
  const partialOuts = Number.parseInt(outs, 10)

  if (!Number.isFinite(whole) || !Number.isFinite(partialOuts)) {
    return parseNumericValue(normalized)
  }

  return whole + (partialOuts / 3)
}

export function normalizeRate(value) {
  const parsed = parseNumericValue(value)

  if (parsed === null) {
    return null
  }

  return parsed > PERCENT_SCALE_THRESHOLD
    ? parsed / 100
    : parsed
}

function roundTo(value, places = 3) {
  if (!Number.isFinite(value)) {
    return null
  }

  return Number(value.toFixed(places))
}

function asNumberOrNull(value, places = 3) {
  const parsed = parseNumericValue(value)
  return parsed === null ? null : roundTo(parsed, places)
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }

  return numerator / denominator
}

function getWeightedLeagueEra(teamStats = []) {
  let earnedRuns = 0
  let inningsPitched = 0

  for (const stat of teamStats) {
    earnedRuns += parseNumericValue(stat?.earnedRuns) || 0
    inningsPitched += parseInningsPitched(stat?.inningsPitched) || 0
  }

  const runsPerInning = safeDivide(earnedRuns, inningsPitched)
  return runsPerInning === null ? null : runsPerInning * 9
}

export function buildLeaguePitchingContext(teamStats = []) {
  let homeRuns = 0
  let walks = 0
  let hitByPitch = 0
  let strikeouts = 0
  let inningsPitched = 0
  let flyBalls = 0

  for (const stat of teamStats) {
    homeRuns += parseNumericValue(stat?.homeRuns) || 0
    walks += parseNumericValue(stat?.baseOnBalls) || 0
    hitByPitch += parseNumericValue(stat?.hitBatsmen) || 0
    strikeouts += parseNumericValue(stat?.strikeOuts) || 0
    inningsPitched += parseInningsPitched(stat?.inningsPitched) || 0
    flyBalls += (parseNumericValue(stat?.flyOuts) || 0) + (parseNumericValue(stat?.homeRuns) || 0)
  }

  const leagueEra = getWeightedLeagueEra(teamStats)
  const fipWithoutConstant = safeDivide(
    (13 * homeRuns) + (3 * (walks + hitByPitch)) - (2 * strikeouts),
    inningsPitched
  )
  const fipConstant = leagueEra !== null && fipWithoutConstant !== null
    ? leagueEra - fipWithoutConstant
    : FIP_CONSTANT_FALLBACK
  const hrPerFlyBallRate = safeDivide(homeRuns, flyBalls)

  return {
    leagueEra: roundTo(leagueEra, 3),
    fipConstant: roundTo(fipConstant, 3) ?? FIP_CONSTANT_FALLBACK,
    hrPerFlyBallRate: roundTo(
      hrPerFlyBallRate ?? MINIMUM_HR_PER_FLY_BALL_RATE,
      4
    ) ?? MINIMUM_HR_PER_FLY_BALL_RATE
  }
}

function calculateFip(stat, leagueContext) {
  const homeRuns = parseNumericValue(stat?.homeRuns)
  const walks = parseNumericValue(stat?.baseOnBalls)
  const hitByPitch = parseNumericValue(stat?.hitBatsmen) || 0
  const strikeouts = parseNumericValue(stat?.strikeOuts)
  const inningsPitched = parseInningsPitched(stat?.inningsPitched)

  if (
    homeRuns === null ||
    walks === null ||
    strikeouts === null ||
    inningsPitched === null ||
    inningsPitched === 0
  ) {
    return null
  }

  const calculated = (
    (13 * homeRuns) +
    (3 * (walks + hitByPitch)) -
    (2 * strikeouts)
  ) / inningsPitched + (leagueContext?.fipConstant ?? FIP_CONSTANT_FALLBACK)

  return roundTo(calculated, 3)
}

function calculateXFip(stat, leagueContext) {
  const walks = parseNumericValue(stat?.baseOnBalls)
  const hitByPitch = parseNumericValue(stat?.hitBatsmen) || 0
  const strikeouts = parseNumericValue(stat?.strikeOuts)
  const inningsPitched = parseInningsPitched(stat?.inningsPitched)
  const homeRuns = parseNumericValue(stat?.homeRuns) || 0
  const flyOuts = parseNumericValue(stat?.flyOuts)

  if (
    walks === null ||
    strikeouts === null ||
    inningsPitched === null ||
    inningsPitched === 0 ||
    flyOuts === null
  ) {
    return null
  }

  const expectedHomeRuns = (flyOuts + homeRuns) * (leagueContext?.hrPerFlyBallRate ?? MINIMUM_HR_PER_FLY_BALL_RATE)
  const calculated = (
    (13 * expectedHomeRuns) +
    (3 * (walks + hitByPitch)) -
    (2 * strikeouts)
  ) / inningsPitched + (leagueContext?.fipConstant ?? FIP_CONSTANT_FALLBACK)

  return roundTo(calculated, 3)
}

function normalizeSavantPitcherName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parseCsvRow(line) {
  const cells = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (char === "," && !inQuotes) {
      cells.push(current)
      current = ""
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = parseCsvRow(lines[0]).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const values = parseCsvRow(line)
    const row = {}

    headers.forEach((header, index) => {
      row[header] = values[index] ?? ""
    })

    return row
  })
}

function readAdvancedMetric(row, ...keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key]
    }
  }

  return null
}

export async function fetchSavantPitcherStatMap(season, fetchImpl = fetch) {
  const selections = [
    "player_id",
    "pitcher",
    "k_percent",
    "bb_percent",
    "avg",
    "slg",
    "xba",
    "xslg",
    "xera",
    "hard_hit_percent",
    "barrel_batted_rate",
    "exit_velocity_avg"
  ].join(",")

  const savantUrl = `https://baseballsavant.mlb.com/leaderboard/custom?year=${season}&type=pitcher&filter=&min=0&selections=${encodeURIComponent(selections)}&chart=false&x=xera&y=xera&r=no&chartType=beeswarm&csv=true`
  const csvText = await fetchTextWithRetry(savantUrl, { fetchImpl })
  const rows = parseCsv(csvText)
  const advancedStatsByPlayerId = {}
  const advancedStatsByName = {}

  for (const row of rows) {
    const playerId = readAdvancedMetric(row, "player_id", "player_id ")
    const playerName = readAdvancedMetric(row, "pitcher", "player_name", "last_name, first_name")
    const advancedStat = {
      // Baseball Savant exposes these Statcast metrics on the pitcher custom leaderboard.
      strikeoutRate: normalizeRate(readAdvancedMetric(row, "k_percent", "K%")),
      walkRate: normalizeRate(readAdvancedMetric(row, "bb_percent", "BB%")),
      expectedBattingAverageAgainst: asNumberOrNull(readAdvancedMetric(row, "xba", "xBA")),
      expectedSluggingAgainst: asNumberOrNull(readAdvancedMetric(row, "xslg", "xSLG")),
      xera: asNumberOrNull(readAdvancedMetric(row, "xera", "xERA")),
      hardHitRate: normalizeRate(readAdvancedMetric(row, "hard_hit_percent", "Hard Hit %")),
      barrelRate: normalizeRate(readAdvancedMetric(row, "barrel_batted_rate", "Barrel%")),
      averageExitVelocity: asNumberOrNull(readAdvancedMetric(row, "exit_velocity_avg", "Avg EV (MPH)"))
    }

    if (playerId) {
      advancedStatsByPlayerId[String(playerId)] = advancedStat
    }

    const normalizedName = normalizeSavantPitcherName(playerName)

    if (normalizedName) {
      advancedStatsByName[normalizedName] = advancedStat
    }
  }

  return {
    byPlayerId: advancedStatsByPlayerId,
    byName: advancedStatsByName
  }
}

export function getAdvancedPitcherStats(playerId, playerName, savantPitcherStats = null) {
  if (!savantPitcherStats) {
    return null
  }

  if (playerId && savantPitcherStats.byPlayerId?.[String(playerId)]) {
    return savantPitcherStats.byPlayerId[String(playerId)]
  }

  const normalizedName = normalizeSavantPitcherName(playerName)

  return normalizedName
    ? savantPitcherStats.byName?.[normalizedName] || null
    : null
}

export function normalizePitcherStatRecord(stat, advancedStat = null, leagueContext = null) {
  const innings = parseInningsPitched(stat?.inningsPitched)
  const strikeoutRate = normalizeRate(advancedStat?.strikeoutRate ?? stat?.strikeoutPercentage)
  const walkRate = normalizeRate(advancedStat?.walkRate ?? stat?.baseOnBallsPercentage)
  const strikeoutMinusWalkRate = strikeoutRate !== null && walkRate !== null
    ? roundTo(strikeoutRate - walkRate, 4)
    : null

  const record = {
    era: asNumberOrNull(stat?.era),
    whip: asNumberOrNull(stat?.whip),
    strikeouts: parseNumericValue(stat?.strikeOuts),
    innings,
    // Baseball Savant's xERA is not in the legacy Stats API payload, so we merge it here.
    xera: asNumberOrNull(advancedStat?.xera),
    // Prefer a native FIP field if MLB adds one, otherwise calculate it from standard pitching totals.
    fip: asNumberOrNull(stat?.fip) ?? calculateFip(stat, leagueContext),
    // MLB does not expose xFIP on the season stats payload, so we calculate it from fly balls and league HR/FB.
    xfip: asNumberOrNull(stat?.xfip) ?? calculateXFip(stat, leagueContext),
    strikeoutRate,
    walkRate,
    strikeoutMinusWalkRate,
    // `avg` on pitcher season stats is batting average against (BAA).
    battingAverageAgainst: asNumberOrNull(stat?.avg),
    // Baseball Savant `xba` is expected batting average against for pitchers.
    expectedBattingAverageAgainst: asNumberOrNull(advancedStat?.expectedBattingAverageAgainst),
    // `slg` on pitcher season stats is slugging allowed / slugging against.
    sluggingAgainst: asNumberOrNull(stat?.slg),
    // Baseball Savant `xslg` is expected slugging against for pitchers.
    expectedSluggingAgainst: asNumberOrNull(advancedStat?.expectedSluggingAgainst),
    hardHitRate: normalizeRate(advancedStat?.hardHitRate),
    barrelRate: normalizeRate(advancedStat?.barrelRate),
    averageExitVelocity: asNumberOrNull(advancedStat?.averageExitVelocity),
    homeRunsAllowed: parseNumericValue(stat?.homeRuns),
    walks: parseNumericValue(stat?.baseOnBalls),
    hitByPitch: parseNumericValue(stat?.hitBatsmen),
    flyBalls: (() => {
      const flyOuts = parseNumericValue(stat?.flyOuts)
      const homeRuns = parseNumericValue(stat?.homeRuns)
      return flyOuts === null && homeRuns === null
        ? null
        : (flyOuts || 0) + (homeRuns || 0)
    })()
  }

  return record
}
