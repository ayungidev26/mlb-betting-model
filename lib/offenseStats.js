import {
  asNumberOrNull,
  normalizeRate,
  parseNumericValue,
  roundTo,
  safeDivide
} from "./pitcherStats.js"
import { fetchJsonWithRetry, fetchTextWithRetry } from "./upstreamFetch.js"
import { normalizeMlbTeamName } from "./teamNames.js"
import { parseCsv, readAdvancedMetric } from "./savantCsv.js"

function readPrimaryStat(statsData) {
  return statsData?.stats?.[0]?.splits?.[0]?.stat || null
}

function buildTeamHittingStatUrl(teamId, extraQuery = "") {
  const separator = extraQuery ? `&${extraQuery}` : ""
  return `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=hitting${separator}`
}

async function fetchOptionalJson(url, label) {
  try {
    return await fetchJsonWithRetry(url)
  } catch (error) {
    console.warn(`fetchTeamOffenseStats: unable to load ${label}`, error?.message || error)
    return null
  }
}

function parsePlateAppearances(stat) {
  const directValue = parseNumericValue(stat?.plateAppearances)

  if (directValue !== null) {
    return directValue
  }

  const atBats = parseNumericValue(stat?.atBats) || 0
  const walks = parseNumericValue(stat?.baseOnBalls) || 0
  const hitByPitch = parseNumericValue(stat?.hitByPitch) || parseNumericValue(stat?.hitBatsmen) || 0
  const sacrificeFlies = parseNumericValue(stat?.sacFlies) || 0
  const sacrificeBunts = parseNumericValue(stat?.sacBunts) || 0
  const total = atBats + walks + hitByPitch + sacrificeFlies + sacrificeBunts

  return total > 0 ? total : null
}

function calculateBattingAverage(stat) {
  const directValue = asNumberOrNull(stat?.avg)

  if (directValue !== null) {
    return directValue
  }

  const hits = parseNumericValue(stat?.hits)
  const atBats = parseNumericValue(stat?.atBats)
  return roundTo(safeDivide(hits, atBats), 3)
}

function calculateOnBasePercentage(stat) {
  const directValue = asNumberOrNull(stat?.obp)

  if (directValue !== null) {
    return directValue
  }

  const hits = parseNumericValue(stat?.hits)
  const walks = parseNumericValue(stat?.baseOnBalls)
  const hitByPitch = parseNumericValue(stat?.hitByPitch) || parseNumericValue(stat?.hitBatsmen) || 0
  const atBats = parseNumericValue(stat?.atBats)
  const sacrificeFlies = parseNumericValue(stat?.sacFlies) || 0
  const numerator = (hits || 0) + (walks || 0) + hitByPitch
  const denominator = (atBats || 0) + (walks || 0) + hitByPitch + sacrificeFlies

  return roundTo(safeDivide(numerator, denominator), 3)
}

function calculateTotalBases(stat) {
  const totalBases = parseNumericValue(stat?.totalBases)

  if (totalBases !== null) {
    return totalBases
  }

  const hits = parseNumericValue(stat?.hits)
  const doubles = parseNumericValue(stat?.doubles) || 0
  const triples = parseNumericValue(stat?.triples) || 0
  const homeRuns = parseNumericValue(stat?.homeRuns) || 0

  if (hits === null) {
    return null
  }

  const singles = hits - doubles - triples - homeRuns
  return singles + (2 * doubles) + (3 * triples) + (4 * homeRuns)
}

function calculateSluggingPercentage(stat) {
  const directValue = asNumberOrNull(stat?.slg)

  if (directValue !== null) {
    return directValue
  }

  const totalBases = calculateTotalBases(stat)
  const atBats = parseNumericValue(stat?.atBats)
  return roundTo(safeDivide(totalBases, atBats), 3)
}

function calculateIsolatedPower(stat, battingAverage, sluggingPercentage) {
  const directValue = asNumberOrNull(stat?.iso)

  if (directValue !== null) {
    return directValue
  }

  if (!Number.isFinite(battingAverage) || !Number.isFinite(sluggingPercentage)) {
    return null
  }

  return roundTo(sluggingPercentage - battingAverage, 3)
}

function calculateOps(stat, onBasePercentage, sluggingPercentage) {
  const directValue = asNumberOrNull(stat?.ops)

  if (directValue !== null) {
    return directValue
  }

  if (!Number.isFinite(onBasePercentage) || !Number.isFinite(sluggingPercentage)) {
    return null
  }

  return roundTo(onBasePercentage + sluggingPercentage, 3)
}

function readRateFromStat(stat, directFields = [], numeratorField) {
  for (const field of directFields) {
    const directValue = normalizeRate(stat?.[field])

    if (directValue !== null) {
      return directValue
    }
  }

  const numerator = parseNumericValue(stat?.[numeratorField])
  const plateAppearances = parsePlateAppearances(stat)
  return roundTo(safeDivide(numerator, plateAppearances), 4)
}

function calculateRunsPerGame(stat) {
  const gamesPlayed = parseNumericValue(stat?.gamesPlayed)
  const runs = parseNumericValue(stat?.runs)
  return roundTo(safeDivide(runs, gamesPlayed), 3)
}

function buildApproximateWrcPlus(weightedOnBaseAverage, leagueWeightedOnBaseAverage) {
  if (!Number.isFinite(weightedOnBaseAverage) || !Number.isFinite(leagueWeightedOnBaseAverage) || leagueWeightedOnBaseAverage <= 0) {
    return null
  }

  // MLB Stats API does not expose team-level wRC+ in the current team season payload,
  // so we use a league-indexed wOBA approximation to keep the feature shape stable.
  return roundTo((weightedOnBaseAverage / leagueWeightedOnBaseAverage) * 100, 1)
}

export function normalizeTeamOffenseStatRecord(stat = null, advancedStat = null) {
  if (!stat && !advancedStat) {
    return {
      gamesPlayed: null,
      plateAppearances: null,
      runsPerGame: null,
      battingAverage: null,
      onBasePercentage: null,
      sluggingPercentage: null,
      ops: null,
      isolatedPower: null,
      strikeoutRate: null,
      walkRate: null,
      weightedOnBaseAverage: null,
      weightedRunsCreatedPlus: null,
      expectedBattingAverage: null,
      expectedSlugging: null,
      expectedWeightedOnBaseAverage: null,
      hardHitRate: null,
      barrelRate: null
    }
  }

  const battingAverage = calculateBattingAverage(stat || {})
  const onBasePercentage = calculateOnBasePercentage(stat || {})
  const sluggingPercentage = calculateSluggingPercentage(stat || {})

  return {
    gamesPlayed: parseNumericValue(stat?.gamesPlayed),
    plateAppearances: parsePlateAppearances(stat || {}),
    runsPerGame: calculateRunsPerGame(stat || {}),
    battingAverage,
    onBasePercentage,
    sluggingPercentage,
    ops: calculateOps(stat || {}, onBasePercentage, sluggingPercentage),
    isolatedPower: calculateIsolatedPower(stat || {}, battingAverage, sluggingPercentage),
    strikeoutRate: readRateFromStat(stat || {}, ["strikeoutPercentage", "strikeOutPercentage", "kPercent"], "strikeOuts"),
    walkRate: readRateFromStat(stat || {}, ["baseOnBallsPercentage", "walkPercentage", "bbPercent"], "baseOnBalls"),
    weightedOnBaseAverage: asNumberOrNull(advancedStat?.weightedOnBaseAverage ?? stat?.woba),
    weightedRunsCreatedPlus: asNumberOrNull(advancedStat?.weightedRunsCreatedPlus ?? stat?.wrcPlus ?? stat?.wRCPlus, 1),
    expectedBattingAverage: asNumberOrNull(advancedStat?.expectedBattingAverage),
    expectedSlugging: asNumberOrNull(advancedStat?.expectedSlugging),
    expectedWeightedOnBaseAverage: asNumberOrNull(advancedStat?.expectedWeightedOnBaseAverage),
    hardHitRate: normalizeRate(advancedStat?.hardHitRate),
    barrelRate: normalizeRate(advancedStat?.barrelRate)
  }
}

function createEmptyRollingSplit() {
  return normalizeTeamOffenseStatRecord(null, null)
}

function buildRollingAccumulator() {
  return {
    gamesPlayed: 0,
    runs: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    baseOnBalls: 0,
    strikeOuts: 0,
    hitByPitch: 0,
    sacFlies: 0,
    sacBunts: 0,
    totalBases: 0
  }
}

function accumulateGameLogStat(accumulator, stat) {
  accumulator.gamesPlayed += 1
  accumulator.runs += parseNumericValue(stat?.runs) || 0
  accumulator.atBats += parseNumericValue(stat?.atBats) || 0
  accumulator.hits += parseNumericValue(stat?.hits) || 0
  accumulator.doubles += parseNumericValue(stat?.doubles) || 0
  accumulator.triples += parseNumericValue(stat?.triples) || 0
  accumulator.homeRuns += parseNumericValue(stat?.homeRuns) || 0
  accumulator.baseOnBalls += parseNumericValue(stat?.baseOnBalls) || 0
  accumulator.strikeOuts += parseNumericValue(stat?.strikeOuts) || 0
  accumulator.hitByPitch += parseNumericValue(stat?.hitByPitch) || parseNumericValue(stat?.hitBatsmen) || 0
  accumulator.sacFlies += parseNumericValue(stat?.sacFlies) || 0
  accumulator.sacBunts += parseNumericValue(stat?.sacBunts) || 0
  accumulator.totalBases += parseNumericValue(stat?.totalBases) || calculateTotalBases(stat) || 0
}

function extractSplitDate(split) {
  const rawDate = split?.date || split?.game?.gameDate || split?.stat?.gameDate || split?.gameDate

  if (!rawDate) {
    return null
  }

  const parsed = new Date(rawDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getUtcStartOfDay(date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )
}

function buildRollingSplit(gameLogSplits = [], windowDays, referenceDate = new Date()) {
  const accumulator = buildRollingAccumulator()
  const referenceTime = getUtcStartOfDay(referenceDate)
  const inclusiveWindowDays = windowDays + 1

  for (const split of gameLogSplits) {
    const gameDate = extractSplitDate(split)

    if (!gameDate) {
      continue
    }

    const ageInDays = (referenceTime - getUtcStartOfDay(gameDate)) / 86400000

    if (ageInDays < 0 || ageInDays > inclusiveWindowDays) {
      continue
    }

    accumulateGameLogStat(accumulator, split?.stat || {})
  }

  if (accumulator.gamesPlayed === 0) {
    return createEmptyRollingSplit()
  }

  return normalizeTeamOffenseStatRecord(accumulator, null)
}

function createWeightedMetricBucket() {
  return {
    weightedTotal: 0,
    weight: 0
  }
}

function accumulateWeightedMetric(bucket, value, weight) {
  if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) {
    return
  }

  bucket.weightedTotal += value * weight
  bucket.weight += weight
}

function finalizeWeightedMetric(bucket, places = 4) {
  if (!bucket.weight) {
    return null
  }

  return roundTo(bucket.weightedTotal / bucket.weight, places)
}

export async function fetchSavantTeamOffenseStatMap(season, fetchImpl = fetch) {
  const selections = [
    "player_id",
    "player_name",
    "team_id",
    "team",
    "pa",
    "woba",
    "xwoba",
    "xba",
    "xslg",
    "hard_hit_percent",
    "barrel_batted_rate"
  ].join(",")

  const savantUrl = `https://baseballsavant.mlb.com/leaderboard/custom?year=${season}&type=batter&filter=&min=0&selections=${encodeURIComponent(selections)}&chart=false&x=woba&y=woba&r=no&chartType=beeswarm&csv=true`
  const csvText = await fetchTextWithRetry(savantUrl, { fetchImpl })
  const rows = parseCsv(csvText)
  const statsByTeamId = {}
  const statsByTeamName = {}

  for (const row of rows) {
    const teamId = readAdvancedMetric(row, "team_id", "teamId")
    const teamName = normalizeMlbTeamName(readAdvancedMetric(row, "team", "team_name", "teamName"))
    const weight = parseNumericValue(readAdvancedMetric(row, "pa", "PA")) || 0
    const resolvedKeys = []

    if (teamId) {
      resolvedKeys.push({ bucketSet: statsByTeamId, key: String(teamId) })
    }

    if (teamName) {
      resolvedKeys.push({ bucketSet: statsByTeamName, key: teamName })
    }

    if (resolvedKeys.length === 0) {
      continue
    }

    for (const { bucketSet, key } of resolvedKeys) {
      const bucket = bucketSet[key] || {
        weightedOnBaseAverage: createWeightedMetricBucket(),
        expectedWeightedOnBaseAverage: createWeightedMetricBucket(),
        expectedBattingAverage: createWeightedMetricBucket(),
        expectedSlugging: createWeightedMetricBucket(),
        hardHitRate: createWeightedMetricBucket(),
        barrelRate: createWeightedMetricBucket()
      }

      accumulateWeightedMetric(bucket.weightedOnBaseAverage, asNumberOrNull(readAdvancedMetric(row, "woba", "wOBA")), weight)
      accumulateWeightedMetric(bucket.expectedWeightedOnBaseAverage, asNumberOrNull(readAdvancedMetric(row, "xwoba", "xwOBA")), weight)
      accumulateWeightedMetric(bucket.expectedBattingAverage, asNumberOrNull(readAdvancedMetric(row, "xba", "xBA")), weight)
      accumulateWeightedMetric(bucket.expectedSlugging, asNumberOrNull(readAdvancedMetric(row, "xslg", "xSLG")), weight)
      accumulateWeightedMetric(bucket.hardHitRate, normalizeRate(readAdvancedMetric(row, "hard_hit_percent", "Hard Hit %")), weight)
      accumulateWeightedMetric(bucket.barrelRate, normalizeRate(readAdvancedMetric(row, "barrel_batted_rate", "Barrel%")), weight)

      bucketSet[key] = bucket
    }
  }

  const finalizeBucketSet = (bucketSet) => Object.fromEntries(
    Object.entries(bucketSet).map(([key, bucket]) => ([
      key,
      {
        weightedOnBaseAverage: finalizeWeightedMetric(bucket.weightedOnBaseAverage, 3),
        expectedWeightedOnBaseAverage: finalizeWeightedMetric(bucket.expectedWeightedOnBaseAverage, 3),
        expectedBattingAverage: finalizeWeightedMetric(bucket.expectedBattingAverage, 3),
        expectedSlugging: finalizeWeightedMetric(bucket.expectedSlugging, 3),
        hardHitRate: finalizeWeightedMetric(bucket.hardHitRate, 4),
        barrelRate: finalizeWeightedMetric(bucket.barrelRate, 4)
      }
    ]))
  )

  return {
    byTeamId: finalizeBucketSet(statsByTeamId),
    byTeamName: finalizeBucketSet(statsByTeamName)
  }
}

function getAdvancedTeamStat(team, advancedStatMap = null) {
  if (!advancedStatMap) {
    return null
  }

  return advancedStatMap.byTeamId?.[String(team.id)] || advancedStatMap.byTeamName?.[team.name] || null
}

export async function fetchTeamOffenseStatsByTeam(referenceDate = new Date()) {
  const teamsUrl = "https://statsapi.mlb.com/api/v1/teams?sportId=1"
  const teamsData = await fetchJsonWithRetry(teamsUrl)
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : []
  const season = referenceDate.getUTCFullYear()
  const offenseStats = {}

  let advancedStatMap = null

  try {
    advancedStatMap = await fetchSavantTeamOffenseStatMap(season)
  } catch (error) {
    console.warn("fetchTeamOffenseStats: unable to load Baseball Savant metrics", error?.message || error)
  }

  for (const team of teams) {
    const [overallData, vsRightData, vsLeftData, homeData, awayData, gameLogData] = await Promise.all([
      fetchOptionalJson(buildTeamHittingStatUrl(team.id), `${team.name} overall offense stats`),
      fetchOptionalJson(buildTeamHittingStatUrl(team.id, "sitCodes=vr"), `${team.name} vs RHP offense split`),
      fetchOptionalJson(buildTeamHittingStatUrl(team.id, "sitCodes=vl"), `${team.name} vs LHP offense split`),
      fetchOptionalJson(buildTeamHittingStatUrl(team.id, "homeRoad=H"), `${team.name} home offense split`),
      fetchOptionalJson(buildTeamHittingStatUrl(team.id, "homeRoad=A"), `${team.name} away offense split`),
      fetchOptionalJson(`https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=gameLog&group=hitting&season=${season}`, `${team.name} game log offense`)
    ])

    const advancedStat = getAdvancedTeamStat(team, advancedStatMap)
    const gameLogSplits = gameLogData?.stats?.[0]?.splits || []

    offenseStats[team.name] = {
      teamId: team.id,
      teamName: team.name,
      source: {
        seasonStatsEndpoint: "statsapi.mlb.com/api/v1/teams/{teamId}/stats?stats=season&group=hitting",
        rollingStatsEndpoint: "statsapi.mlb.com/api/v1/teams/{teamId}/stats?stats=gameLog&group=hitting",
        advancedStatsEndpoint: advancedStat ? "baseballsavant.mlb.com/leaderboard/custom (team-weighted batter export)" : null,
        weightedRunsCreatedPlus: "Approximate league-indexed wOBA when a direct team wRC+ field is unavailable"
      },
      ...normalizeTeamOffenseStatRecord(readPrimaryStat(overallData), advancedStat),
      splits: {
        vsRightHanded: normalizeTeamOffenseStatRecord(readPrimaryStat(vsRightData), null),
        vsLeftHanded: normalizeTeamOffenseStatRecord(readPrimaryStat(vsLeftData), null),
        home: normalizeTeamOffenseStatRecord(readPrimaryStat(homeData), null),
        away: normalizeTeamOffenseStatRecord(readPrimaryStat(awayData), null),
        last7Days: buildRollingSplit(gameLogSplits, 7, referenceDate),
        last14Days: buildRollingSplit(gameLogSplits, 14, referenceDate)
      }
    }
  }

  const weightedOnBaseValues = Object.values(offenseStats)
    .map((team) => team.weightedOnBaseAverage)
    .filter((value) => Number.isFinite(value))
  const leagueWeightedOnBaseAverage = weightedOnBaseValues.length > 0
    ? roundTo(weightedOnBaseValues.reduce((total, value) => total + value, 0) / weightedOnBaseValues.length, 3)
    : null

  for (const team of Object.values(offenseStats)) {
    if (team.weightedRunsCreatedPlus === null) {
      team.weightedRunsCreatedPlus = buildApproximateWrcPlus(team.weightedOnBaseAverage, leagueWeightedOnBaseAverage)
    }

    const vsRight = team?.splits?.vsRightHanded
    if (vsRight && vsRight.weightedRunsCreatedPlus === null) {
      vsRight.weightedRunsCreatedPlus = buildApproximateWrcPlus(vsRight.weightedOnBaseAverage, leagueWeightedOnBaseAverage)
    }

    const vsLeft = team?.splits?.vsLeftHanded
    if (vsLeft && vsLeft.weightedRunsCreatedPlus === null) {
      vsLeft.weightedRunsCreatedPlus = buildApproximateWrcPlus(vsLeft.weightedOnBaseAverage, leagueWeightedOnBaseAverage)
    }
  }

  return offenseStats
}
