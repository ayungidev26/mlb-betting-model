import { buildMatchKey } from "./matchKey"

function moneylineToImpliedProbability(moneyline) {
  if (typeof moneyline !== "number") {
    return null
  }

  if (moneyline > 0) {
    return 100 / (moneyline + 100)
  }

  return Math.abs(moneyline) / (Math.abs(moneyline) + 100)
}

function normalizeSportsbook(game, bookmaker) {
  const market = bookmaker.markets?.find(entry => entry.key === "h2h")

  if (!market) {
    return null
  }

  const homeOutcome = market.outcomes?.find(
    outcome => outcome.name === game.home_team
  )
  const awayOutcome = market.outcomes?.find(
    outcome => outcome.name === game.away_team
  )

  if (
    typeof homeOutcome?.price !== "number" ||
    typeof awayOutcome?.price !== "number"
  ) {
    return null
  }

  const homeImpliedProbability =
    moneylineToImpliedProbability(homeOutcome.price)
  const awayImpliedProbability =
    moneylineToImpliedProbability(awayOutcome.price)

  const hold = homeImpliedProbability + awayImpliedProbability

  return {
    sportsbook: bookmaker.key,
    lastUpdated: bookmaker.last_update,
    homeMoneyline: homeOutcome.price,
    awayMoneyline: awayOutcome.price,
    hold: Number(hold.toFixed(6))
  }
}

function selectPrimaryLine(lines) {
  if (lines.length === 0) {
    return null
  }

  return lines.reduce((bestLine, currentLine) => {
    if (currentLine.hold < bestLine.hold) {
      return currentLine
    }

    if (
      currentLine.hold === bestLine.hold &&
      (currentLine.lastUpdated || "") > (bestLine.lastUpdated || "")
    ) {
      return currentLine
    }

    return bestLine
  })
}

export function normalizeOddsGame(game) {
  const sportsbooks = (game.bookmakers || [])
    .map(bookmaker => normalizeSportsbook(game, bookmaker))
    .filter(Boolean)

  const primaryLine = selectPrimaryLine(sportsbooks)

  if (!primaryLine) {
    return null
  }

  return {
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
    primaryLine,
    sportsbooks
  }
}

export function normalizeOddsPayload(payload) {
  return (payload || [])
    .map(game => normalizeOddsGame(game))
    .filter(Boolean)
}
