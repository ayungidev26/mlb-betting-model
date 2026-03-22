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

function createSnapshot(record = null) {
  if (!record) {
    return null
  }

  return {
    gamesPlayed: record.gamesPlayed ?? null,
    plateAppearances: record.plateAppearances ?? null,
    runsPerGame: record.runsPerGame ?? null,
    battingAverage: record.battingAverage ?? null,
    onBasePercentage: record.onBasePercentage ?? null,
    sluggingPercentage: record.sluggingPercentage ?? null,
    ops: record.ops ?? null,
    isolatedPower: record.isolatedPower ?? null,
    strikeoutRate: record.strikeoutRate ?? null,
    walkRate: record.walkRate ?? null,
    weightedOnBaseAverage: record.weightedOnBaseAverage ?? null,
    weightedRunsCreatedPlus: record.weightedRunsCreatedPlus ?? null,
    expectedBattingAverage: record.expectedBattingAverage ?? null,
    expectedSlugging: record.expectedSlugging ?? null,
    expectedWeightedOnBaseAverage: record.expectedWeightedOnBaseAverage ?? null,
    hardHitRate: record.hardHitRate ?? null,
    barrelRate: record.barrelRate ?? null
  }
}

function buildPowerScore(record = null) {
  if (!record) {
    return null
  }

  const inputs = [
    scaleHigherBetter(record.sluggingPercentage, 0.36, 0.5, 35),
    scaleHigherBetter(record.isolatedPower, 0.11, 0.23, 30),
    scaleHigherBetter(record.expectedSlugging, 0.37, 0.5, 20),
    scaleHigherBetter(record.hardHitRate, 0.32, 0.46, 10),
    scaleHigherBetter(record.barrelRate, 0.05, 0.12, 10)
  ]
  const scored = inputs.reduce((total, value) => total + value, 0)
  return Number(scored.toFixed(2))
}

function buildPlateDisciplineScore(record = null) {
  if (!record) {
    return null
  }

  const inputs = [
    scaleHigherBetter(record.onBasePercentage, 0.29, 0.36, 30),
    scaleHigherBetter(record.walkRate, 0.06, 0.11, 25),
    scaleLowerBetter(record.strikeoutRate, 0.17, 0.27, 25)
  ]
  const scored = inputs.reduce((total, value) => total + value, 0)
  return Number(scored.toFixed(2))
}

function selectHandednessSplit(teamOffense = null, opposingPitcherHand = null) {
  if (!teamOffense?.splits) {
    return null
  }

  if (opposingPitcherHand === "L") {
    return teamOffense.splits.vsLeftHanded || null
  }

  if (opposingPitcherHand === "R") {
    return teamOffense.splits.vsRightHanded || null
  }

  return null
}

function selectVenueSplit(teamOffense = null, isHomeTeam = false) {
  if (!teamOffense?.splits) {
    return null
  }

  return isHomeTeam ? teamOffense.splits.home || null : teamOffense.splits.away || null
}

function buildRecentForm(teamOffense = null) {
  const last7 = teamOffense?.splits?.last7Days || null
  const last14 = teamOffense?.splits?.last14Days || null

  if (!last7 && !last14) {
    return null
  }

  const recentRuns = (
    ((last7?.runsPerGame ?? 0) * 0.65) +
    ((last14?.runsPerGame ?? 0) * 0.35)
  )
  const recentOps = (
    ((last7?.ops ?? 0) * 0.65) +
    ((last14?.ops ?? 0) * 0.35)
  )

  if (!Number.isFinite(recentRuns) || !Number.isFinite(recentOps) || (recentRuns === 0 && recentOps === 0)) {
    return null
  }

  return Number((
    scaleHigherBetter(recentRuns, 3.4, 5.8, 40) +
    scaleHigherBetter(recentOps, 0.66, 0.86, 35)
  ).toFixed(2))
}

export function buildOffenseRatingDetails(teamOffense = null, context = {}) {
  if (!teamOffense) {
    return {
      rating: 0,
      stats: null,
      components: [],
      derived: {
        offenseVsHandedness: null,
        recentOffenseForm: null,
        powerScore: null,
        plateDisciplineScore: null,
        venueAdjustedOps: null,
        opposingPitcherHand: context?.opposingPitcherHand || null
      }
    }
  }

  const handednessSplit = selectHandednessSplit(teamOffense, context?.opposingPitcherHand)
  const venueSplit = selectVenueSplit(teamOffense, context?.isHomeTeam)
  const recentOffenseForm = buildRecentForm(teamOffense)
  const powerScore = buildPowerScore(teamOffense)
  const plateDisciplineScore = buildPlateDisciplineScore(teamOffense)
  const offenseVsHandedness = handednessSplit?.weightedRunsCreatedPlus ?? handednessSplit?.ops ?? null
  const venueAdjustedOps = venueSplit?.ops ?? null

  const components = [
    createComponent("Runs/Game", scaleHigherBetter(teamOffense.runsPerGame, 3.5, 5.8, 20), teamOffense.runsPerGame),
    createComponent("AVG", scaleHigherBetter(teamOffense.battingAverage, 0.225, 0.285, 8), teamOffense.battingAverage),
    createComponent("OBP", scaleHigherBetter(teamOffense.onBasePercentage, 0.295, 0.36, 16), teamOffense.onBasePercentage),
    createComponent("SLG", scaleHigherBetter(teamOffense.sluggingPercentage, 0.36, 0.5, 16), teamOffense.sluggingPercentage),
    createComponent("OPS", scaleHigherBetter(teamOffense.ops, 0.67, 0.85, 14), teamOffense.ops),
    createComponent("ISO", scaleHigherBetter(teamOffense.isolatedPower, 0.11, 0.23, 10), teamOffense.isolatedPower),
    createComponent("K%", scaleLowerBetter(teamOffense.strikeoutRate, 0.17, 0.27, 10), teamOffense.strikeoutRate),
    createComponent("BB%", scaleHigherBetter(teamOffense.walkRate, 0.06, 0.11, 10), teamOffense.walkRate),
    createComponent("wOBA", scaleHigherBetter(teamOffense.weightedOnBaseAverage, 0.295, 0.37, 14), teamOffense.weightedOnBaseAverage),
    createComponent("wRC+", scaleHigherBetter(teamOffense.weightedRunsCreatedPlus, 85, 125, 18), teamOffense.weightedRunsCreatedPlus),
    createComponent("xBA", scaleHigherBetter(teamOffense.expectedBattingAverage, 0.225, 0.285, 6), teamOffense.expectedBattingAverage),
    createComponent("xSLG", scaleHigherBetter(teamOffense.expectedSlugging, 0.37, 0.5, 8), teamOffense.expectedSlugging),
    createComponent("xwOBA", scaleHigherBetter(teamOffense.expectedWeightedOnBaseAverage, 0.3, 0.37, 10), teamOffense.expectedWeightedOnBaseAverage),
    createComponent("Hard Hit%", scaleHigherBetter(teamOffense.hardHitRate, 0.32, 0.46, 8), teamOffense.hardHitRate),
    createComponent("Barrel%", scaleHigherBetter(teamOffense.barrelRate, 0.05, 0.12, 8), teamOffense.barrelRate),
    createComponent("vs pitcher hand", scaleHigherBetter(offenseVsHandedness, 90, 120, 14), offenseVsHandedness),
    createComponent("Venue split OPS", scaleHigherBetter(venueAdjustedOps, 0.67, 0.85, 8), venueAdjustedOps),
    createComponent("Recent form", scaleHigherBetter(recentOffenseForm, 20, 60, 12), recentOffenseForm),
    createComponent("Power score", scaleHigherBetter(powerScore, 30, 80, 10), powerScore),
    createComponent("Plate discipline", scaleHigherBetter(plateDisciplineScore, 25, 65, 10), plateDisciplineScore)
  ]

  const rating = Number(components.reduce((total, component) => total + component.score, 0).toFixed(2))

  return {
    rating,
    stats: {
      overall: createSnapshot(teamOffense),
      splits: {
        vsRightHanded: createSnapshot(teamOffense?.splits?.vsRightHanded || null),
        vsLeftHanded: createSnapshot(teamOffense?.splits?.vsLeftHanded || null),
        home: createSnapshot(teamOffense?.splits?.home || null),
        away: createSnapshot(teamOffense?.splits?.away || null),
        last7Days: createSnapshot(teamOffense?.splits?.last7Days || null),
        last14Days: createSnapshot(teamOffense?.splits?.last14Days || null)
      }
    },
    components,
    derived: {
      offenseVsHandedness,
      recentOffenseForm,
      powerScore,
      plateDisciplineScore,
      venueAdjustedOps,
      opposingPitcherHand: context?.opposingPitcherHand || null
    }
  }
}

export function getOffenseRatingDetails(teamName, offenseStats, context = {}) {
  if (!teamName || !offenseStats || typeof offenseStats !== "object") {
    return {
      rating: 0,
      stats: null,
      components: [],
      derived: {
        offenseVsHandedness: null,
        recentOffenseForm: null,
        powerScore: null,
        plateDisciplineScore: null,
        venueAdjustedOps: null,
        opposingPitcherHand: context?.opposingPitcherHand || null
      }
    }
  }

  return buildOffenseRatingDetails(offenseStats[teamName] || null, context)
}
