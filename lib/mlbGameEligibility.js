const MLB_TEAM_IDS = new Set([
  108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 133, 134, 135, 136, 137, 138,
  139, 140, 141, 142, 143, 144, 145, 146, 147, 158
])
const MLB_TEAM_NAMES = new Set([
  "Arizona Diamondbacks", "Atlanta Braves", "Athletics", "Oakland Athletics",
  "Baltimore Orioles", "Boston Red Sox", "Chicago Cubs", "Chicago White Sox",
  "Cincinnati Reds", "Cleveland Guardians", "Colorado Rockies", "Detroit Tigers",
  "Houston Astros", "Kansas City Royals", "Los Angeles Angels", "Los Angeles Dodgers",
  "Miami Marlins", "Milwaukee Brewers", "Minnesota Twins", "New York Mets",
  "New York Yankees", "Philadelphia Phillies", "Pittsburgh Pirates", "San Diego Padres",
  "San Francisco Giants", "Seattle Mariners", "St. Louis Cardinals", "Tampa Bay Rays",
  "Texas Rangers", "Toronto Blue Jays", "Washington Nationals"
])

const POSTSEASON_GAME_TYPES = new Set(["P", "F", "D", "L", "W"])
const BETTABLE_GAME_TYPES = new Set(["R", ...POSTSEASON_GAME_TYPES])
const COMPLETED_STATUS_CODES = new Set(["F"])
const COMPLETED_STATUS_WORDS = ["final", "completed"]
const UNPLAYABLE_STATUS_CODES = new Set(["C"])
const UNPLAYABLE_STATUS_WORDS = ["postponed", "cancelled", "canceled", "suspended"]

export function classifyMlbGameType(gameType) {
  if (gameType === "R") return "regular"
  if (POSTSEASON_GAME_TYPES.has(gameType)) return "playoffs"
  if (gameType === "S") return "spring"
  return "exhibition"
}

export function classifyMlbGameLifecycle(game) {
  const statusCode = String(game?.status?.codedGameState || game?.statusCode || "").toUpperCase()
  const statusText = String(game?.status?.detailedState || game?.status || "").toLowerCase()

  if (
    COMPLETED_STATUS_CODES.has(statusCode) ||
    COMPLETED_STATUS_WORDS.some((word) => statusText.includes(word))
  ) {
    return "completed"
  }

  if (statusCode === "I" || statusText.includes("progress") || statusText.includes("live")) {
    return "live"
  }

  return "upcoming"
}

function getBaseEligibility(game) {
  const homeTeamId = Number(game?.teams?.home?.team?.id)
  const awayTeamId = Number(game?.teams?.away?.team?.id)

  if (!BETTABLE_GAME_TYPES.has(game?.gameType)) {
    return { eligible: false, reason: `game_type_${game?.gameType || "missing"}` }
  }

  const homeIsMlb = MLB_TEAM_IDS.has(homeTeamId) || MLB_TEAM_NAMES.has(game?.teams?.home?.team?.name)
  const awayIsMlb = MLB_TEAM_IDS.has(awayTeamId) || MLB_TEAM_NAMES.has(game?.teams?.away?.team?.name)

  if (!homeIsMlb || !awayIsMlb) {
    return { eligible: false, reason: "non_mlb_opponent" }
  }

  return { eligible: true, reason: null }
}

export function isDisplayableMlbGame(game) {
  const baseEligibility = getBaseEligibility(game)
  if (!baseEligibility.eligible) return baseEligibility

  const statusCode = String(game?.status?.codedGameState || "").toUpperCase()
  const statusText = String(game?.status?.detailedState || "").toLowerCase()

  if (
    UNPLAYABLE_STATUS_CODES.has(statusCode) ||
    UNPLAYABLE_STATUS_WORDS.some((word) => statusText.includes(word))
  ) {
    return { eligible: false, reason: `status_${statusCode || "ineligible"}` }
  }

  return { eligible: true, reason: null }
}

export function isEligibleMlbGame(game) {
  const displayEligibility = isDisplayableMlbGame(game)
  if (!displayEligibility.eligible) return displayEligibility

  const statusCode = String(game?.status?.codedGameState || "").toUpperCase()
  const statusText = String(game?.status?.detailedState || "").toLowerCase()

  if (
    COMPLETED_STATUS_CODES.has(statusCode) ||
    COMPLETED_STATUS_WORDS.some((word) => statusText.includes(word))
  ) {
    return { eligible: false, reason: `status_${statusCode || "ineligible"}` }
  }

  return { eligible: true, reason: null }
}
