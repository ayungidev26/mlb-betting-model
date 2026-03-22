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
    averageExitVelocity: pitcher.averageExitVelocity ?? null
  }
}

export async function getPitcherStats(stats = null) {
  if (stats) return stats

  return await redis.get("mlb:stats:pitchers")
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

export async function getPitcherRatingDetails(name, stats = null) {
  if (!name) {
    return {
      rating: 0,
      stats: null,
      components: []
    }
  }

  const pitcherStats = await getPitcherStats(stats)
  const pitcher = pitcherStats?.[name] || null

  return buildPitcherRatingDetails(pitcher)
}

export async function getPitcherRating(name, stats = null) {
  const details = await getPitcherRatingDetails(name, stats)
  return details.rating
}
