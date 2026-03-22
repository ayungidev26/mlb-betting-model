function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function toNumber(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
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

function createBullpenStatSnapshot(bullpen = null) {
  if (!bullpen) {
    return null
  }

  return {
    era: bullpen.era ?? null,
    whip: bullpen.whip ?? null,
    fip: bullpen.fip ?? null,
    xfip: bullpen.xfip ?? null,
    strikeoutRate: bullpen.strikeoutRate ?? null,
    walkRate: bullpen.walkRate ?? null,
    strikeoutMinusWalkRate: bullpen.strikeoutMinusWalkRate ?? null,
    homeRunsPer9: bullpen.homeRunsPer9 ?? null,
    battingAverageAgainst: bullpen.battingAverageAgainst ?? null,
    leftOnBaseRate: bullpen.leftOnBaseRate ?? null,
    hardHitRate: bullpen.hardHitRate ?? null,
    barrelRate: bullpen.barrelRate ?? null,
    averageExitVelocity: bullpen.averageExitVelocity ?? null,
    usage: {
      inningsLast3Days: bullpen?.usage?.inningsLast3Days ?? null,
      inningsLast5Days: bullpen?.usage?.inningsLast5Days ?? null,
      relieversUsedYesterday: bullpen?.usage?.relieversUsedYesterday ?? null,
      keyRelieversBackToBack: bullpen?.usage?.keyRelieversBackToBack ?? null
    }
  }
}

export function buildBullpenRatingDetails(bullpen = null) {
  if (!bullpen) {
    return {
      rating: 0,
      stats: null,
      components: []
    }
  }

  const components = [
    createComponent("ERA", scaleLowerBetter(toNumber(bullpen.era), 2.9, 5.0, 30), toNumber(bullpen.era)),
    createComponent("WHIP", scaleLowerBetter(toNumber(bullpen.whip), 1.05, 1.45, 18), toNumber(bullpen.whip)),
    createComponent("FIP", scaleLowerBetter(toNumber(bullpen.fip), 3.1, 4.9, 16), toNumber(bullpen.fip)),
    createComponent("xFIP", scaleLowerBetter(toNumber(bullpen.xfip), 3.2, 4.8, 12), toNumber(bullpen.xfip)),
    createComponent("K%", scaleHigherBetter(toNumber(bullpen.strikeoutRate), 0.18, 0.31, 12), toNumber(bullpen.strikeoutRate)),
    createComponent("BB%", scaleLowerBetter(toNumber(bullpen.walkRate), 0.05, 0.12, 10), toNumber(bullpen.walkRate)),
    createComponent("K-BB%", scaleHigherBetter(toNumber(bullpen.strikeoutMinusWalkRate), 0.09, 0.22, 14), toNumber(bullpen.strikeoutMinusWalkRate)),
    createComponent("HR/9", scaleLowerBetter(toNumber(bullpen.homeRunsPer9), 0.7, 1.5, 10), toNumber(bullpen.homeRunsPer9)),
    createComponent("OBA", scaleLowerBetter(toNumber(bullpen.battingAverageAgainst), 0.205, 0.27, 12), toNumber(bullpen.battingAverageAgainst)),
    createComponent("LOB%", scaleHigherBetter(toNumber(bullpen.leftOnBaseRate), 0.66, 0.78, 8), toNumber(bullpen.leftOnBaseRate)),
    createComponent("Hard Hit%", scaleLowerBetter(toNumber(bullpen.hardHitRate), 0.31, 0.43, 9), toNumber(bullpen.hardHitRate)),
    createComponent("Barrel%", scaleLowerBetter(toNumber(bullpen.barrelRate), 0.055, 0.1, 7), toNumber(bullpen.barrelRate)),
    createComponent("Avg EV", scaleLowerBetter(toNumber(bullpen.averageExitVelocity), 86, 91, 7), toNumber(bullpen.averageExitVelocity)),
    createComponent("Bullpen IP last 3 days", scaleLowerBetter(toNumber(bullpen?.usage?.inningsLast3Days), 2, 10, 8), toNumber(bullpen?.usage?.inningsLast3Days)),
    createComponent("Bullpen IP last 5 days", scaleLowerBetter(toNumber(bullpen?.usage?.inningsLast5Days), 4, 16, 6), toNumber(bullpen?.usage?.inningsLast5Days)),
    createComponent("Relievers used yesterday", scaleLowerBetter(toNumber(bullpen?.usage?.relieversUsedYesterday), 1, 6, 5), toNumber(bullpen?.usage?.relieversUsedYesterday)),
    createComponent(
      "Key relievers back-to-back",
      bullpen?.usage?.keyRelieversBackToBack === true ? -6 : bullpen?.usage?.keyRelieversBackToBack === false ? 2 : 0,
      bullpen?.usage?.keyRelieversBackToBack === null || bullpen?.usage?.keyRelieversBackToBack === undefined
        ? null
        : (bullpen.usage.keyRelieversBackToBack ? 1 : 0)
    )
  ]

  const rating = Number(components.reduce((total, component) => total + component.score, 0).toFixed(2))

  return {
    rating,
    stats: createBullpenStatSnapshot(bullpen),
    components
  }
}

export function getBullpenRatingDetails(teamName, bullpenStats) {
  if (!teamName || !bullpenStats || typeof bullpenStats !== "object") {
    return {
      rating: 0,
      stats: null,
      components: []
    }
  }

  const bullpen = bullpenStats[teamName]

  if (!bullpen || typeof bullpen !== "object") {
    return {
      rating: 0,
      stats: null,
      components: []
    }
  }

  return buildBullpenRatingDetails(bullpen)
}

export function getBullpenRating(teamName, bullpenStats) {
  return getBullpenRatingDetails(teamName, bullpenStats).rating
}

export function calculateBullpenRating(bullpen) {
  return buildBullpenRatingDetails(bullpen).rating
}
