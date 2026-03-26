export function moneylineToImpliedProbability(moneyline) {
  if (typeof moneyline !== "number") {
    return null
  }

  if (moneyline > 0) {
    return 100 / (moneyline + 100)
  }

  return Math.abs(moneyline) / (Math.abs(moneyline) + 100)
}

export function normalizeSportsbookMarket(game, bookmaker, marketKey = "h2h") {
  const market = bookmaker?.markets?.find(entry => entry?.key === marketKey)

  if (!market) {
    return null
  }

  const homeOutcome = market?.outcomes?.find(
    outcome => outcome?.name === game?.home_team
  )
  const awayOutcome = market?.outcomes?.find(
    outcome => outcome?.name === game?.away_team
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
    sportsbookName: bookmaker.title || bookmaker.key,
    market: marketKey,
    selections: [
      { name: game.home_team, price: homeOutcome.price },
      { name: game.away_team, price: awayOutcome.price }
    ],
    lastUpdated: bookmaker.last_update,
    homeMoneyline: homeOutcome.price,
    awayMoneyline: awayOutcome.price,
    hold: Number(hold.toFixed(6))
  }
}

export function selectPrimaryLine(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
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

export function getBestOddsForSelection(sportsbooks = [], teamName) {
  if (!teamName) {
    return null
  }

  return sportsbooks.reduce((bestLine, line) => {
    const selection = line?.selections?.find(item => item?.name === teamName)

    if (typeof selection?.price !== "number") {
      return bestLine
    }

    if (!bestLine || selection.price > bestLine.odds) {
      return {
        odds: selection.price,
        sportsbook: line.sportsbook,
        sportsbookName: line.sportsbookName || line.sportsbook,
        market: line.market,
        lastUpdated: line.lastUpdated
      }
    }

    return bestLine
  }, null)
}

export function getSportsbookOddsForSelection(
  sportsbooks = [],
  teamName,
  sportsbookKeys = []
) {
  const normalizedKeys = sportsbookKeys
    .map(value => String(value || "").toLowerCase())
    .filter(Boolean)

  if (!teamName || normalizedKeys.length === 0) {
    return null
  }

  const line = sportsbooks.find(entry =>
    normalizedKeys.includes(String(entry?.sportsbook || "").toLowerCase())
  )
  const selection = line?.selections?.find(item => item?.name === teamName)

  if (typeof selection?.price !== "number") {
    return null
  }

  return {
    odds: selection.price,
    sportsbook: line.sportsbook,
    sportsbookName: line.sportsbookName || line.sportsbook,
    market: line.market,
    lastUpdated: line.lastUpdated
  }
}
