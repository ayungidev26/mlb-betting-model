import { buildMlbGameIdentity, getEasternDate } from "./gameIdentity.js"
import { buildMatchKey } from "./matchKey.js"
import { classifyMlbGameLifecycle, classifyMlbGameType, isDisplayableMlbGame } from "./mlbGameEligibility.js"

export function collectHistoricalFinals(schedule, season) {
  const gamesById = new Map()
  for (const day of schedule.dates) {
    for (const game of day.games) {
      if (!isDisplayableMlbGame(game).eligible || classifyMlbGameLifecycle(game) !== "completed") continue

      const homeScore = game.teams.home.score
      const awayScore = game.teams.away.score
      const matchKey = buildMlbGameIdentity(game.gamePk)
      if (!matchKey || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) ||
        homeScore < 0 || awayScore < 0 || homeScore === awayScore) continue

      const officialDate = game.officialDate || day.date || getEasternDate(game.gameDate)
      // MLB can return the same suspended game under its original and resumed dates.
      const previous = gamesById.get(game.gamePk)
      if (previous && day.date !== officialDate) continue
      gamesById.set(game.gamePk, {
        gamePk: game.gamePk,
        matchKey,
        season,
        date: game.gameDate,
        officialDate,
        homeTeam: game.teams.home.team.name,
        awayTeam: game.teams.away.team.name,
        homeScore,
        awayScore,
        seasonType: classifyMlbGameType(game.gameType)
      })
    }
  }
  return [...gamesById.values()].sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk)
}

export function historicalDate(game) {
  return game.officialDate || (/^\d{4}-\d{2}-\d{2}$/.test(game.date) ? game.date : getEasternDate(game.date))
}

export function compareHistoricalFinals(previous, current, season, schedule) {
  const stored = Array.isArray(previous) ? previous : []
  const currentIds = new Set(current.map(game => game.gamePk))
  const legacyIdentity = game => `${game.date}|${game.awayTeam}|${game.homeTeam}`
  const legacyIds = new Map()
  const excludedLegacyGames = new Set()
  for (const day of schedule.dates) {
    for (const game of day.games) {
      if (classifyMlbGameLifecycle(game) !== "completed") continue
      const key = legacyIdentity({
        date: game.gameDate, awayTeam: game.teams?.away?.team?.name, homeTeam: game.teams?.home?.team?.name
      })
      if (!isDisplayableMlbGame(game).eligible) excludedLegacyGames.add(key)
      if (!currentIds.has(game.gamePk)) continue
      const ids = legacyIds.get(key) || new Set()
      ids.add(game.gamePk)
      legacyIds.set(key, ids)
    }
  }
  const storedIds = new Set()
  const missingFromSource = []
  for (const game of stored) {
    if (game.gamePk != null && currentIds.has(game.gamePk)) {
      storedIds.add(game.gamePk)
    } else if (game.gamePk == null && legacyIds.has(legacyIdentity(game))) {
      const ids = legacyIds.get(legacyIdentity(game))
      const unusedId = [...ids].find(id => !storedIds.has(id))
      if (unusedId != null) storedIds.add(unusedId)
    } else if (!excludedLegacyGames.has(legacyIdentity(game))) {
      missingFromSource.push(game)
    }
  }
  const added = current.filter(game => !storedIds.has(game.gamePk))
  return {
    season,
    storedGames: stored.length,
    sourceGames: current.length,
    latestOfficialDate: current.reduce((latest, game) => latest > game.officialDate ? latest : game.officialDate, null),
    added: added.map(({ gamePk, officialDate }) => ({ gamePk, officialDate })),
    missingFromSource: missingFromSource.map(({ gamePk, date, homeTeam, awayTeam }) => ({
      gamePk: gamePk ?? null, date, homeTeam, awayTeam
    }))
  }
}

export function prepareHistoricalEvaluation(predictions, finals) {
  const legacyMatches = new Map()
  const results = finals.map(game => {
    const utcKey = buildMatchKey(game.date, game.awayTeam, game.homeTeam)
    const dayKey = buildMatchKey(historicalDate(game), game.awayTeam, game.homeTeam)
    const result = { ...game, matchKey: buildMlbGameIdentity(game.gamePk) || game.matchKey || utcKey }
    for (const key of new Set([utcKey, dayKey])) {
      if (key) legacyMatches.set(key, legacyMatches.has(key) ? null : result)
    }
    return result
  })
  const resultKeys = new Set(results.map(game => game.matchKey))

  return {
    predictions: predictions.map((prediction, index) => {
      const storedKey = prediction.matchKey
      const gameId = prediction.gamePk ?? prediction.gameId
      const identity = /^\d+$/.test(String(gameId))
        ? buildMlbGameIdentity(gameId)
        : storedKey?.startsWith("v2|mlb|") ? storedKey : null
      if (identity && resultKeys.has(identity)) return { ...prediction, matchKey: identity }

      const legacyKey = buildMatchKey(historicalDate(prediction), prediction.awayTeam, prediction.homeTeam) || storedKey
      const result = legacyMatches.get(legacyKey)
      const canUseLegacyResult = result && (!identity || !result.matchKey?.startsWith("v2|mlb|"))
      return {
        ...prediction,
        matchKey: canUseLegacyResult ? result.matchKey : identity || `unmatched-legacy:${index}`
      }
    }),
    finals: results
  }
}
