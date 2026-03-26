import { buildMatchKey } from "./matchKey.js"
import {
  validateCanonicalOddsRecord,
  validateExternalOddsPayload
} from "./payloadValidation.js"
import {
  normalizeSportsbookMarket,
  selectPrimaryLine
} from "./oddsHelpers.js"

export function toCanonicalOddsRecord(game) {
  const gameId = game.gameId || game.id
  const commenceTime = game.commenceTime || game.commence_time
  const homeTeam = game.homeTeam || game.home_team
  const awayTeam = game.awayTeam || game.away_team
  const homeMoneyline = game.homeMoneyline
  const awayMoneyline = game.awayMoneyline
  const sportsbook = game.sportsbook
  const lastUpdated = game.lastUpdated
  const sportsbooks = Array.isArray(game.sportsbooks)
    ? game.sportsbooks
    : undefined

  if (
    !gameId ||
    !commenceTime ||
    !homeTeam ||
    !awayTeam ||
    typeof homeMoneyline !== "number" ||
    typeof awayMoneyline !== "number" ||
    !sportsbook ||
    !lastUpdated
  ) {
    return null
  }

  const canonicalRecord = {
    gameId,
    matchKey:
      game.matchKey || buildMatchKey(commenceTime, awayTeam, homeTeam),
    commenceTime,
    homeTeam,
    awayTeam,
    homeMoneyline,
    awayMoneyline,
    sportsbook,
    lastUpdated,
    ...(sportsbooks ? { sportsbooks } : {})
  }

  validateCanonicalOddsRecord(canonicalRecord)

  return canonicalRecord
}

export function normalizeOddsGame(game) {
  const sportsbooks = (game.bookmakers || [])
    .map(bookmaker => normalizeSportsbookMarket(game, bookmaker, "h2h"))
    .filter(Boolean)

  const primaryLine = selectPrimaryLine(sportsbooks)

  if (!primaryLine) {
    return null
  }

  return toCanonicalOddsRecord({
    gameId: game.id,
    matchKey: buildMatchKey(
      game.commence_time,
      game.away_team,
      game.home_team
    ),
    commenceTime: game.commence_time,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    homeMoneyline: primaryLine.homeMoneyline,
    awayMoneyline: primaryLine.awayMoneyline,
    sportsbook: primaryLine.sportsbook,
    lastUpdated: primaryLine.lastUpdated,
    sportsbooks
  })
}

export function normalizeOddsPayload(payload) {
  validateExternalOddsPayload(payload)

  return payload
    .map(game => normalizeOddsGame(game))
    .filter(Boolean)
}
