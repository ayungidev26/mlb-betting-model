import { redis } from "../lib/upstash.js"

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function scaleLowerBetter(value, elite, poor, weight) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = (poor - value) / (poor - elite)
  return clamp(normalized, 0, 1) * weight
}

function scaleHigherBetter(value, replacement, elite, weight) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = (value - replacement) / (elite - replacement)
  return clamp(normalized, 0, 1) * weight
}

function createComponent(label, score, value) {
  return {
    label,
    score: Number(score.toFixed(2)),
    value: Number.isFinite(value) ? value : null
  }
}

function createPitcherStatSnapshot(pitcher = null) {
  if (!pitcher) {
    return null
  }

  return {
    throwingHand: pitcher.throwingHand ?? null,
    era: pitcher.era ?? null,
    whip: pitcher.whip ?? null,
    strikeouts: pitcher.strikeouts ?? null,
    innings: pitcher.innings ?? null,
    xera: pitcher.xera ?? null,
    fip: pitcher.fip ?? null,
    xfip: pitcher.xfip ?? null,
    strikeoutRate: pitcher.strikeoutRate ?? null,
    walkRate: pitcher.walkRate ?? null,
    strikeoutMinusWalkRate: pitcher.strikeoutMinusWalkRate ?? null,
    battingAverageAgainst: pitcher.battingAverageAgainst ?? null,
    expectedBattingAverageAgainst: pitcher.expectedBattingAverageAgainst ?? null,
    sluggingAgainst: pitcher.sluggingAgainst ?? null,
    expectedSluggingAgainst: pitcher.expectedSluggingAgainst ?? null,
    hardHitRate: pitcher.hardHitRate ?? null,
    barrelRate: pitcher.barrelRate ?? null,
    averageExitVelocity: pitcher.averageExitVelocity ?? null,
    homeRunsAllowed: pitcher.homeRunsAllowed ?? null,
    flyBalls: pitcher.flyBalls ?? null,
    hrPerFlyBallRate: (
      typeof pitcher.homeRunsAllowed === "number" &&
      typeof pitcher.flyBalls === "number" &&
      pitcher.flyBalls > 0
    )
      ? pitcher.homeRunsAllowed / pitcher.flyBalls
      : null
  }
}

export async function getPitcherStats(stats = null) {
  if (stats) return stats

  return await redis.get("mlb:stats:pitchers")
}

function toNumericInnings(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function normalizePitcherStatsStore(rawStats = null) {
  if (!rawStats || typeof rawStats !== "object") {
    return {
      byId: {},
      aliasMap: {},
      byName: {}
    }
  }

  if (rawStats.byId && typeof rawStats.byId === "object") {
    const byId = rawStats.byId
    const aliasMap = rawStats.aliasMap && typeof rawStats.aliasMap === "object"
      ? rawStats.aliasMap
      : {}
    const byName = {}

    Object.values(byId).forEach((pitcher) => {
      if (!pitcher || typeof pitcher !== "object") {
        return
      }

      const fullName = pitcher.fullName

      if (typeof fullName === "string" && fullName.length > 0 && !byName[fullName]) {
        byName[fullName] = pitcher
      }
    })

    return { byId, aliasMap, byName }
  }

  return {
    byId: {},
    aliasMap: {},
    byName: rawStats
  }
}

function resolvePitcherRecord({
  pitcherName = null,
  pitcherId = null,
  team = null,
  stats = null
}) {
  const { byId, aliasMap, byName } = normalizePitcherStatsStore(stats)
  const pitcherIdKey = pitcherId !== undefined && pitcherId !== null ? String(pitcherId) : null

  if (pitcherIdKey && byId[pitcherIdKey]) {
    return {
      pitcher: byId[pitcherIdKey],
      pitcherId: byId[pitcherIdKey]?.pitcherId || pitcherId
    }
  }

  if (!pitcherName) {
    return { pitcher: null, pitcherId: pitcherId || null }
  }

  const aliasPitcherIds = Array.isArray(aliasMap[pitcherName]) ? aliasMap[pitcherName] : []

  if (aliasPitcherIds.length === 1) {
    const onlyPitcher = byId[String(aliasPitcherIds[0])] || null
    return {
      pitcher: onlyPitcher,
      pitcherId: onlyPitcher?.pitcherId || aliasPitcherIds[0] || null
    }
  }

  if (aliasPitcherIds.length > 1) {
    const candidates = aliasPitcherIds
      .map(id => byId[String(id)])
      .filter(Boolean)

    let selected = null

    if (team) {
      selected = candidates.find((candidate) => candidate?.teamName === team) || null
    }

    if (!selected && candidates.length > 0) {
      selected = [...candidates].sort((a, b) => {
        const inningsDiff = toNumericInnings(b?.innings) - toNumericInnings(a?.innings)

        if (inningsDiff !== 0) {
          return inningsDiff
        }

        const eraA = typeof a?.era === "number" ? a.era : Number.POSITIVE_INFINITY
        const eraB = typeof b?.era === "number" ? b.era : Number.POSITIVE_INFINITY

        return eraA - eraB
      })[0]

      console.warn("pitcherRatings: duplicate pitcher name collision fallback", {
        pitcherName,
        candidatePitcherIds: candidates.map(candidate => candidate?.pitcherId).filter(Boolean),
        team,
        selectedPitcherId: selected?.pitcherId || null,
        strategy: "highest_innings_then_lowest_era"
      })
    } else {
      console.info("pitcherRatings: duplicate pitcher name resolved using team context", {
        pitcherName,
        candidatePitcherIds: candidates.map(candidate => candidate?.pitcherId).filter(Boolean),
        team,
        selectedPitcherId: selected?.pitcherId || null
      })
    }

    return {
      pitcher: selected,
      pitcherId: selected?.pitcherId || null
    }
  }

  const namedPitcher = byName[pitcherName] || null
  return {
    pitcher: namedPitcher,
    pitcherId: namedPitcher?.pitcherId || pitcherId || null
  }
}

export function buildPitcherRatingDetails(pitcher = null) {
  if (!pitcher) {
    return {
      rating: 0,
      stats: null,
      components: []
    }
  }

  const components = [
    createComponent("ERA", scaleLowerBetter(pitcher.era, 2.5, 5.5, 55), pitcher.era),
    createComponent("WHIP", scaleLowerBetter(pitcher.whip, 0.95, 1.45, 35), pitcher.whip),
    createComponent("Strikeout volume", scaleHigherBetter((pitcher.strikeouts || 0) / (pitcher.innings || 1), 0.7, 1.3, 15), (pitcher.strikeouts || 0) / (pitcher.innings || 1)),
    createComponent("xERA", scaleLowerBetter(pitcher.xera, 2.7, 5.4, 20), pitcher.xera),
    createComponent("FIP", scaleLowerBetter(pitcher.fip, 2.8, 5.2, 18), pitcher.fip),
    createComponent("xFIP", scaleLowerBetter(pitcher.xfip, 3.0, 5.1, 14), pitcher.xfip),
    createComponent("K%", scaleHigherBetter(pitcher.strikeoutRate, 0.16, 0.32, 18), pitcher.strikeoutRate),
    createComponent("BB%", scaleLowerBetter(pitcher.walkRate, 0.04, 0.11, 14), pitcher.walkRate),
    createComponent("K-BB%", scaleHigherBetter(pitcher.strikeoutMinusWalkRate, 0.08, 0.24, 20), pitcher.strikeoutMinusWalkRate),
    createComponent("BAA", scaleLowerBetter(pitcher.battingAverageAgainst, 0.19, 0.29, 12), pitcher.battingAverageAgainst),
    createComponent("xBAA", scaleLowerBetter(pitcher.expectedBattingAverageAgainst, 0.20, 0.29, 10), pitcher.expectedBattingAverageAgainst),
    createComponent("SLG against", scaleLowerBetter(pitcher.sluggingAgainst, 0.31, 0.48, 10), pitcher.sluggingAgainst),
    createComponent("xSLG against", scaleLowerBetter(pitcher.expectedSluggingAgainst, 0.32, 0.49, 10), pitcher.expectedSluggingAgainst),
    createComponent("Hard Hit%", scaleLowerBetter(pitcher.hardHitRate, 0.28, 0.46, 10), pitcher.hardHitRate),
    createComponent("Barrel%", scaleLowerBetter(pitcher.barrelRate, 0.04, 0.11, 8), pitcher.barrelRate),
    createComponent("Avg EV", scaleLowerBetter(pitcher.averageExitVelocity, 85, 92, 8), pitcher.averageExitVelocity)
  ]

  const rating = Number(components.reduce((total, component) => total + component.score, 0).toFixed(2))

  return {
    rating,
    stats: createPitcherStatSnapshot(pitcher),
    components
  }
}

export async function getPitcherRatingDetails(input, stats = null) {
  const pitcherName = typeof input === "string" ? input : input?.name || null
  const pitcherId = typeof input === "object" ? input?.pitcherId : null
  const team = typeof input === "object" ? input?.team : null

  if (!pitcherName && !pitcherId) {
    return {
      rating: 0,
      pitcherId: null,
      stats: null,
      components: []
    }
  }

  const pitcherStats = await getPitcherStats(stats)
  const {
    pitcher,
    pitcherId: resolvedPitcherId
  } = resolvePitcherRecord({
    pitcherName,
    pitcherId,
    team,
    stats: pitcherStats
  })

  const details = buildPitcherRatingDetails(pitcher)

  return {
    ...details,
    pitcherId: resolvedPitcherId
  }
}

export async function getPitcherRating(name, stats = null) {
  const details = await getPitcherRatingDetails(name, stats)
  return details.rating
}
