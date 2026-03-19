export const EDGE_THRESHOLD = 0.03

export function moneylineToImpliedProbability(moneyline) {
  if (typeof moneyline !== "number") {
    return null
  }

  if (moneyline > 0) {
    return 100 / (moneyline + 100)
  }

  return Math.abs(moneyline) / (Math.abs(moneyline) + 100)
}

export function indexOddsByMatchKey(odds = []) {
  return odds.reduce((oddsByMatchKey, gameOdds) => {
    if (!gameOdds?.matchKey) {
      return oddsByMatchKey
    }

    const existingOdds = oddsByMatchKey.get(gameOdds.matchKey)

    if (
      !existingOdds ||
      (gameOdds.lastUpdated || "") > (existingOdds.lastUpdated || "")
    ) {
      oddsByMatchKey.set(gameOdds.matchKey, gameOdds)
    }

    return oddsByMatchKey
  }, new Map())
}

export function findEdgesFromData(
  predictions = [],
  odds = [],
  edgeThreshold = EDGE_THRESHOLD
) {
  const edges = []
  const oddsByMatchKey = indexOddsByMatchKey(odds)
  let matchedGames = 0
  let unmatchedPredictions = 0

  predictions.forEach(prediction => {
    const predictionMatchKey = prediction?.matchKey

    if (!predictionMatchKey) {
      unmatchedPredictions += 1
      return
    }

    const gameOdds = oddsByMatchKey.get(predictionMatchKey)

    if (!gameOdds) {
      unmatchedPredictions += 1
      return
    }

    matchedGames += 1

    const homeOdds = gameOdds.homeMoneyline
    const awayOdds = gameOdds.awayMoneyline

    if (typeof homeOdds !== "number" || typeof awayOdds !== "number") {
      return
    }

    const homeProb = prediction.homeWinProbability
    const awayProb = prediction.awayWinProbability

    if (typeof homeProb !== "number" || typeof awayProb !== "number") {
      return
    }

    const homeImplied = moneylineToImpliedProbability(homeOdds)
    const awayImplied = moneylineToImpliedProbability(awayOdds)

    const homeEdge = homeProb - homeImplied
    const awayEdge = awayProb - awayImplied

    if (homeEdge > edgeThreshold) {
      edges.push({
        gameId: prediction.gameId || gameOdds.gameId,
        matchKey: prediction.matchKey,
        team: prediction.homeTeam,
        market: "moneyline",
        sportsbook: gameOdds.sportsbook,
        odds: homeOdds,
        modelProbability: homeProb,
        impliedProbability: Number(homeImplied.toFixed(4)),
        edge: Number(homeEdge.toFixed(4)),
        threshold: edgeThreshold,
        homeTeam: prediction.homeTeam,
        awayTeam: prediction.awayTeam,
        lastUpdated: gameOdds.lastUpdated
      })
    }

    if (awayEdge > edgeThreshold) {
      edges.push({
        gameId: prediction.gameId || gameOdds.gameId,
        matchKey: prediction.matchKey,
        team: prediction.awayTeam,
        market: "moneyline",
        sportsbook: gameOdds.sportsbook,
        odds: awayOdds,
        modelProbability: awayProb,
        impliedProbability: Number(awayImplied.toFixed(4)),
        edge: Number(awayEdge.toFixed(4)),
        threshold: edgeThreshold,
        homeTeam: prediction.homeTeam,
        awayTeam: prediction.awayTeam,
        lastUpdated: gameOdds.lastUpdated
      })
    }
  })

  return {
    edges,
    matchedGames,
    unmatchedPredictions
  }
}
