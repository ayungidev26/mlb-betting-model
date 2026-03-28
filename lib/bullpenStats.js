import {
  buildLeaguePitchingContext,
  fetchSavantPitcherStatMap,
  getAdvancedPitcherStats,
  normalizeRate,
  parseInningsPitched,
  parseNumericValue,
  roundTo,
  safeDivide,
  asNumberOrNull
} from "./pitcherStats.js"
import { fetchJsonWithRetry } from "./upstreamFetch.js"

const RECENT_USAGE_WINDOWS = [3, 5]
const KEY_RELIEVER_COUNT = 3

function toDateString(date) {
  return date.toISOString().split("T")[0]
}

function shiftUtcDays(date, days) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function createEmptyUsageSnapshot() {
  return {
    inningsLast3Days: null,
    inningsLast5Days: null,
    relieversUsedYesterday: null,
    keyRelieversBackToBack: null
  }
}

function buildStatUrl(teamId, extraQuery = "") {
  const separator = extraQuery ? `&${extraQuery}` : ""
  return `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=pitching${separator}`
}

function readPrimaryStat(statsData) {
  return statsData?.stats?.[0]?.splits?.[0]?.stat || null
}

function parseBattersFaced(stat) {
  return parseNumericValue(stat?.battersFaced)
}

function readRateFromStat(stat, primaryField, numeratorField) {
  const directValue = normalizeRate(stat?.[primaryField])

  if (directValue !== null) {
    return directValue
  }

  const numerator = parseNumericValue(stat?.[numeratorField])
  const battersFaced = parseBattersFaced(stat)
  const calculated = safeDivide(numerator, battersFaced)

  return roundTo(calculated, 4)
}

function calculateHomeRunsPer9(stat) {
  const directValue = asNumberOrNull(stat?.homeRunsPer9)

  if (directValue !== null) {
    return directValue
  }

  const inningsPitched = parseInningsPitched(stat?.inningsPitched)
  const homeRuns = parseNumericValue(stat?.homeRuns)
  const calculated = safeDivide(homeRuns, inningsPitched)

  return calculated === null ? null : roundTo(calculated * 9, 3)
}

function calculateStrikeoutMinusWalkRate(strikeoutRate, walkRate) {
  if (strikeoutRate === null || walkRate === null) {
    return null
  }

  return roundTo(strikeoutRate - walkRate, 4)
}

function readBullpenStatValue(stat, advancedStat = {}) {
  const strikeoutRate = readRateFromStat(stat, "strikeoutPercentage", "strikeOuts")
  const walkRate = readRateFromStat(stat, "baseOnBallsPercentage", "baseOnBalls")

  return {
    era: asNumberOrNull(stat?.era),
    whip: asNumberOrNull(stat?.whip),
    inningsPitched: parseInningsPitched(stat?.inningsPitched),
    // Prefer a native relief-pitching FIP field if the Stats API provides one.
    fip: asNumberOrNull(stat?.fip),
    // xFIP is typically not present on the legacy team stats payload; we calculate it downstream when missing.
    xfip: asNumberOrNull(stat?.xfip),
    strikeoutRate,
    walkRate,
    strikeoutMinusWalkRate: calculateStrikeoutMinusWalkRate(strikeoutRate, walkRate),
    homeRunsPer9: calculateHomeRunsPer9(stat),
    // `avg` on team pitching stats is opponents' batting average against.
    battingAverageAgainst: asNumberOrNull(stat?.avg),
    leftOnBaseRate: normalizeRate(stat?.leftOnBasePercentage),
    hardHitRate: advancedStat?.hardHitRate ?? null,
    barrelRate: advancedStat?.barrelRate ?? null,
    averageExitVelocity: advancedStat?.averageExitVelocity ?? null
  }
}

export function normalizeBullpenStatRecord(
  stat,
  advancedStat = null,
  leagueContext = null,
  usage = null
) {
  const primaryRecord = readBullpenStatValue(stat, advancedStat || {})

  return {
    ...primaryRecord,
    fip: primaryRecord.fip ?? calculateFallbackFip(stat, leagueContext),
    xfip: primaryRecord.xfip ?? calculateFallbackXFip(stat, leagueContext),
    strikeoutRate: primaryRecord.strikeoutRate ?? null,
    walkRate: primaryRecord.walkRate ?? null,
    strikeoutMinusWalkRate: (
      primaryRecord.strikeoutMinusWalkRate ??
      calculateStrikeoutMinusWalkRate(primaryRecord.strikeoutRate, primaryRecord.walkRate)
    ),
    homeRunsPer9: primaryRecord.homeRunsPer9 ?? null,
    battingAverageAgainst: primaryRecord.battingAverageAgainst ?? null,
    leftOnBaseRate: primaryRecord.leftOnBaseRate ?? null,
    hardHitRate: primaryRecord.hardHitRate ?? null,
    barrelRate: primaryRecord.barrelRate ?? null,
    averageExitVelocity: primaryRecord.averageExitVelocity ?? null,
    usage: usage || createEmptyUsageSnapshot()
  }
}

function calculateFallbackFip(stat, leagueContext) {
  if (!stat) return null

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

  return roundTo(
    ((13 * homeRuns) + (3 * (walks + hitByPitch)) - (2 * strikeouts)) / inningsPitched + (leagueContext?.fipConstant ?? 3.2),
    3
  )
}

function calculateFallbackXFip(stat, leagueContext) {
  if (!stat) return null

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

  const expectedHomeRuns = (flyOuts + homeRuns) * (leagueContext?.hrPerFlyBallRate ?? 0.105)

  return roundTo(
    ((13 * expectedHomeRuns) + (3 * (walks + hitByPitch)) - (2 * strikeouts)) / inningsPitched + (leagueContext?.fipConstant ?? 3.2),
    3
  )
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

function isRelieverStat(stat) {
  const gamesStarted = parseNumericValue(stat?.gamesStarted) || 0
  const gamesPitched = parseNumericValue(stat?.gamesPitched) || 0
  const saves = parseNumericValue(stat?.saves) || 0
  const holds = parseNumericValue(stat?.holds) || 0

  return gamesPitched > 0 && (gamesStarted < gamesPitched || saves > 0 || holds > 0)
}

async function fetchTeamPitcherRoster(teamId) {
  const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=fullSeason&season=${new Date().getUTCFullYear()}`
  const rosterData = await fetchJsonWithRetry(rosterUrl)
  return Array.isArray(rosterData?.roster) ? rosterData.roster : []
}

async function fetchPitcherSeasonStat(playerId) {
  const statsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching`
  const statsData = await fetchJsonWithRetry(statsUrl)
  return readPrimaryStat(statsData)
}

function buildUsageWindowSummary(recentGames, topRelieverIds) {
  const usage = {
    inningsLast3Days: 0,
    inningsLast5Days: 0,
    relieversUsedYesterday: 0,
    keyRelieversBackToBack: false
  }
  const usageByDay = new Map()

  for (const game of recentGames) {
    const current = usageByDay.get(game.dayOffset) || {
      relieverInnings: 0,
      relieverIds: new Set()
    }

    current.relieverInnings += game.relieverInnings

    for (const relieverId of game.relieverIds) {
      current.relieverIds.add(relieverId)
    }

    usageByDay.set(game.dayOffset, current)

    if (game.dayOffset <= RECENT_USAGE_WINDOWS[0]) {
      usage.inningsLast3Days += game.relieverInnings
    }

    if (game.dayOffset <= RECENT_USAGE_WINDOWS[1]) {
      usage.inningsLast5Days += game.relieverInnings
    }
  }

  const yesterdayUsage = usageByDay.get(1) || null
  const twoDaysAgoUsage = usageByDay.get(2) || null

  if (yesterdayUsage) {
    usage.relieversUsedYesterday = yesterdayUsage.relieverIds.size
  }

  if (yesterdayUsage && twoDaysAgoUsage) {
    usage.keyRelieversBackToBack = topRelieverIds.some((relieverId) => (
      yesterdayUsage.relieverIds.has(relieverId) && twoDaysAgoUsage.relieverIds.has(relieverId)
    ))
  }

  usage.inningsLast3Days = roundTo(usage.inningsLast3Days, 3)
  usage.inningsLast5Days = roundTo(usage.inningsLast5Days, 3)

  return usage
}

function extractTeamReliefUsage(boxscoreData, teamId) {
  const teams = [boxscoreData?.teams?.home, boxscoreData?.teams?.away].filter(Boolean)
  const teamData = teams.find((entry) => entry?.team?.id === teamId)

  if (!teamData || !Array.isArray(teamData.pitchers)) {
    return {
      relieverInnings: 0,
      relieverIds: new Set()
    }
  }

  const relieverIds = new Set(teamData.pitchers.slice(1).map(String))
  let relieverInnings = 0

  for (const relieverId of relieverIds) {
    const player = teamData.players?.[`ID${relieverId}`]
    relieverInnings += parseInningsPitched(player?.stats?.pitching?.inningsPitched) || 0
  }

  return {
    relieverInnings: roundTo(relieverInnings, 3) || 0,
    relieverIds
  }
}

async function fetchRecentTeamBullpenUsage(teamId, referenceDate, topRelieverIds = []) {
  const startDate = toDateString(shiftUtcDays(referenceDate, -5))
  const endDate = toDateString(shiftUtcDays(referenceDate, -1))
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`
  const scheduleData = await fetchJsonWithRetry(scheduleUrl)
  const recentGames = []

  for (const dateEntry of scheduleData?.dates || []) {
    for (const game of dateEntry?.games || []) {
      const gameDate = new Date(game.gameDate)
      const dayOffset = Math.round((referenceDate - gameDate) / 86400000)

      if (dayOffset < 1 || dayOffset > 5) {
        continue
      }

      const boxscoreUrl = `https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`
      const boxscoreData = await fetchJsonWithRetry(boxscoreUrl)
      const usage = extractTeamReliefUsage(boxscoreData, teamId)

      recentGames.push({
        dayOffset,
        ...usage
      })
    }
  }

  return buildUsageWindowSummary(recentGames, topRelieverIds)
}

async function buildBullpenAdvancedStatMap(teams, savantPitcherStats) {
  if (!savantPitcherStats) {
    return {}
  }

  const advancedStatsByTeam = {}

  for (const team of teams) {
    try {
      const roster = await fetchTeamPitcherRoster(team.id)
      const weightedMetrics = {
        hardHitRate: { weightedTotal: 0, weight: 0 },
        barrelRate: { weightedTotal: 0, weight: 0 },
        averageExitVelocity: { weightedTotal: 0, weight: 0 }
      }
      const relievers = []

      for (const rosterEntry of roster) {
        if (rosterEntry?.position?.abbreviation !== "P") {
          continue
        }

        const playerId = rosterEntry?.person?.id

        if (!playerId) {
          continue
        }

        const seasonStat = await fetchPitcherSeasonStat(playerId)

        if (!isRelieverStat(seasonStat)) {
          continue
        }

        const inningsPitched = parseInningsPitched(seasonStat?.inningsPitched)
        const battersFaced = parseBattersFaced(seasonStat)
        const weight = battersFaced || inningsPitched || 0
        const advancedStat = getAdvancedPitcherStats(
          playerId,
          rosterEntry?.person?.fullName,
          savantPitcherStats
        )

        if (advancedStat) {
          accumulateWeightedMetric(weightedMetrics.hardHitRate, advancedStat.hardHitRate, weight)
          accumulateWeightedMetric(weightedMetrics.barrelRate, advancedStat.barrelRate, weight)
          accumulateWeightedMetric(weightedMetrics.averageExitVelocity, advancedStat.averageExitVelocity, weight)
        }

        relievers.push({
          playerId: String(playerId),
          inningsPitched: inningsPitched || 0,
          battersFaced: battersFaced || 0
        })
      }

      const keyRelieverIds = relievers
        .sort((left, right) => (right.inningsPitched - left.inningsPitched) || (right.battersFaced - left.battersFaced))
        .slice(0, KEY_RELIEVER_COUNT)
        .map((reliever) => reliever.playerId)

      const usage = await fetchRecentTeamBullpenUsage(team.id, new Date(), keyRelieverIds)

      advancedStatsByTeam[team.name] = {
        hardHitRate: finalizeWeightedMetric(weightedMetrics.hardHitRate, 4),
        barrelRate: finalizeWeightedMetric(weightedMetrics.barrelRate, 4),
        averageExitVelocity: finalizeWeightedMetric(weightedMetrics.averageExitVelocity, 3),
        usage,
        keyRelieverIds
      }
    } catch (error) {
      console.warn(`fetchBullpenStats: unable to enrich bullpen metrics for ${team.name}`, error?.message || error)
    }
  }

  return advancedStatsByTeam
}

export async function fetchBullpenStatsByTeam(fetchContext = {}) {
  const { season = new Date().getUTCFullYear() } = fetchContext
  const teamsUrl = "https://statsapi.mlb.com/api/v1/teams?sportId=1"
  const teamsData = await fetchJsonWithRetry(teamsUrl)
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : []
  const allTeamPitchingStats = []
  const reliefStatsByTeamId = new Map()

  for (const team of teams) {
    let reliefStats = null

    try {
      reliefStats = readPrimaryStat(await fetchJsonWithRetry(buildStatUrl(team.id, "sitCodes=rp")))
    } catch (error) {
      console.warn(
        "fetchBullpenStats: unable to fetch team relief pitching stats",
        team?.id,
        error?.message || error
      )
      continue
    }

    if (reliefStats) {
      reliefStatsByTeamId.set(team.id, reliefStats)
      allTeamPitchingStats.push(reliefStats)
    }
  }

  const leagueContext = buildLeaguePitchingContext(allTeamPitchingStats)

  let savantPitcherStats = null

  try {
    savantPitcherStats = await fetchSavantPitcherStatMap(season)
  } catch (error) {
    console.warn("fetchBullpenStats: unable to load Baseball Savant reliever metrics", error?.message || error)
  }

  let advancedStatsByTeam = {}

  try {
    advancedStatsByTeam = await buildBullpenAdvancedStatMap(teams, savantPitcherStats)
  } catch (error) {
    console.warn("fetchBullpenStats: unable to build reliever Statcast aggregates", error?.message || error)
  }

  const bullpenStats = {}

  for (const team of teams) {
    const reliefStat = reliefStatsByTeamId.get(team.id) || null

    if (!reliefStat) {
      continue
    }

    const advancedStat = advancedStatsByTeam[team.name] || null

    bullpenStats[team.name] = {
      teamId: team.id,
      ...normalizeBullpenStatRecord(
        reliefStat,
        {
          hardHitRate: advancedStat?.hardHitRate ?? null,
          barrelRate: advancedStat?.barrelRate ?? null,
          averageExitVelocity: advancedStat?.averageExitVelocity ?? null
        },
        leagueContext,
        advancedStat?.usage
      )
    }
  }

  return bullpenStats
}
