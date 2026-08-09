import { normalizeMlbTeamName } from "./teamNames.js"

export const GAME_IDENTITY_VERSION = "v2"
export const ODDS_MATCH_TOLERANCE_MINUTES = 90

export function getEasternDate(input) {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date)
}

export function buildMlbGameIdentity(gamePk) {
  return gamePk === undefined || gamePk === null ? null : `${GAME_IDENTITY_VERSION}|mlb|${gamePk}`
}

export function buildProviderGameIdentity(provider, providerGameId) {
  return !provider || !providerGameId ? null : `${GAME_IDENTITY_VERSION}|provider|${provider}|${providerGameId}`
}

export function teamDateKey({ date, commenceTime, awayTeam, homeTeam }) {
  const dateKey = getEasternDate(date || commenceTime)
  const away = normalizeMlbTeamName(awayTeam)
  const home = normalizeMlbTeamName(homeTeam)
  return dateKey && away && home ? `${dateKey}|${away}|${home}` : null
}

// Provider IDs are authoritative only after an explicit providerId -> MLB gamePk mapping.
// Otherwise doubleheaders are paired by nearest scheduled time within 90 minutes. A tie is
// deliberately ambiguous: placing odds on the wrong game is worse than omitting the market.
export function resolveProviderGames(scheduleGames = [], providerGames = [], options = {}) {
  const toleranceMinutes = options.toleranceMinutes ?? ODDS_MATCH_TOLERANCE_MINUTES
  const providerIdMap = options.providerIdMap || {}
  const available = new Set(scheduleGames.map((_, index) => index))
  const matches = []
  const unmatched = []
  const ambiguous = []

  for (const providerGame of providerGames) {
    const providerId = String(providerGame.providerGameId || providerGame.gameId || providerGame.id || "")
    const mappedGamePk = providerIdMap[providerId]
    let candidates = scheduleGames
      .map((game, index) => ({ game, index }))
      .filter(({ game, index }) => available.has(index) && teamDateKey(game) === teamDateKey(providerGame))

    if (mappedGamePk !== undefined) {
      candidates = candidates.filter(({ game }) => String(game.gamePk ?? game.gameId) === String(mappedGamePk))
    }

    if (candidates.length > 1) {
      const providerTime = new Date(providerGame.commenceTime || providerGame.commence_time).getTime()
      candidates = candidates.map(candidate => ({
        ...candidate,
        deltaMinutes: Math.abs(new Date(candidate.game.scheduledTime || candidate.game.date).getTime() - providerTime) / 60000
      })).filter(candidate => Number.isFinite(candidate.deltaMinutes) && candidate.deltaMinutes <= toleranceMinutes)
        .sort((a, b) => a.deltaMinutes - b.deltaMinutes)
      if (candidates.length > 1 && candidates[0].deltaMinutes === candidates[1].deltaMinutes) {
        ambiguous.push({ providerGameId: providerId, reason: "equal-time candidates", candidateGameIds: candidates.map(c => c.game.gameId) })
        continue
      }
      candidates = candidates.slice(0, 1)
    }

    if (candidates.length !== 1) {
      unmatched.push({ providerGameId: providerId, reason: candidates.length ? "ambiguous" : "no candidate" })
      continue
    }
    const selected = candidates[0]
    available.delete(selected.index)
    matches.push({ scheduleGame: selected.game, providerGame })
  }
  return { matches, unmatched, ambiguous }
}
