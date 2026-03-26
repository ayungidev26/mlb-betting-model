import {
  getBestOddsForSelection,
  getSportsbookOddsForSelection,
  moneylineToImpliedProbability
} from "./oddsHelpers.js"

export const EDGE_THRESHOLD = 0.03

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

    const homeBestLine = getBestOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.homeTeam
    ) || {
      odds: gameOdds.homeMoneyline,
      sportsbook: gameOdds.sportsbook,
      sportsbookName: gameOdds.sportsbook,
      market: "h2h",
      lastUpdated: gameOdds.lastUpdated
    }
    const awayBestLine = getBestOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.awayTeam
    ) || {
      odds: gameOdds.awayMoneyline,
      sportsbook: gameOdds.sportsbook,
      sportsbookName: gameOdds.sportsbook,
      market: "h2h",
      lastUpdated: gameOdds.lastUpdated
    }

    const homeOdds = homeBestLine.odds
    const awayOdds = awayBestLine.odds

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

    const homeDraftKingsLine = getSportsbookOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.homeTeam,
      ["draftkings"]
    )
    const awayDraftKingsLine = getSportsbookOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.awayTeam,
      ["draftkings"]
    )
    const homeFanDuelLine = getSportsbookOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.homeTeam,
      ["fanduel"]
    )
    const awayFanDuelLine = getSportsbookOddsForSelection(
      gameOdds.sportsbooks || [],
      prediction.awayTeam,
      ["fanduel"]
    )

    if (homeEdge > edgeThreshold) {
      edges.push({
        gameId: prediction.gameId || gameOdds.gameId,
        matchKey: prediction.matchKey,
        team: prediction.homeTeam,
        market: "moneyline",
        sportsbook: homeBestLine.sportsbook,
        sportsbookName: homeBestLine.sportsbookName,
        odds: homeOdds,
        bestOdds: homeOdds,
        bestSportsbook: homeBestLine.sportsbook,
        bestSportsbookName: homeBestLine.sportsbookName,
        draftKingsOdds: homeDraftKingsLine?.odds ?? null,
        fanDuelOdds: homeFanDuelLine?.odds ?? null,
        modelProbability: homeProb,
        impliedProbability: Number(homeImplied.toFixed(4)),
        edge: Number(homeEdge.toFixed(4)),
        threshold: edgeThreshold,
        homeTeam: prediction.homeTeam,
        awayTeam: prediction.awayTeam,
        lastUpdated: homeBestLine.lastUpdated || gameOdds.lastUpdated
      })
    }

    if (awayEdge > edgeThreshold) {
      edges.push({
        gameId: prediction.gameId || gameOdds.gameId,
        matchKey: prediction.matchKey,
        team: prediction.awayTeam,
        market: "moneyline",
        sportsbook: awayBestLine.sportsbook,
        sportsbookName: awayBestLine.sportsbookName,
        odds: awayOdds,
        bestOdds: awayOdds,
        bestSportsbook: awayBestLine.sportsbook,
        bestSportsbookName: awayBestLine.sportsbookName,
        draftKingsOdds: awayDraftKingsLine?.odds ?? null,
        fanDuelOdds: awayFanDuelLine?.odds ?? null,
        modelProbability: awayProb,
        impliedProbability: Number(awayImplied.toFixed(4)),
        edge: Number(awayEdge.toFixed(4)),
        threshold: edgeThreshold,
        homeTeam: prediction.homeTeam,
        awayTeam: prediction.awayTeam,
        lastUpdated: awayBestLine.lastUpdated || gameOdds.lastUpdated
      })
    }
  })

  return {
    edges,
    matchedGames,
    unmatchedPredictions
  }
}

export { moneylineToImpliedProbability }
