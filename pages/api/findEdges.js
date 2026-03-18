// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const predictions = await redis.get("mlb:predictions:today")
    const odds = await redis.get("mlb:odds:today")

    if (!predictions || !odds) {
      return res.status(400).json({
        error: "Missing predictions or odds data"
      })
    }

    const EDGE_THRESHOLD = 0.03
    const edges = []

    predictions.forEach(prediction => {

      const gameOdds = odds.find(game => {
        if (prediction.matchKey && game.matchKey) {
          return game.matchKey === prediction.matchKey
        }

        return game.gameId === prediction.gameId
      })

      if (!gameOdds) return

      const homeOdds = gameOdds.homeMoneyline
      const awayOdds = gameOdds.awayMoneyline

      if (typeof homeOdds !== "number" || typeof awayOdds !== "number") {
        return
      }

      const homeProb = prediction.homeWinProbability
      const awayProb = prediction.awayWinProbability

      const homeImplied =
        homeOdds > 0
          ? 100 / (homeOdds + 100)
          : Math.abs(homeOdds) / (Math.abs(homeOdds) + 100)

      const awayImplied =
        awayOdds > 0
          ? 100 / (awayOdds + 100)
          : Math.abs(awayOdds) / (Math.abs(awayOdds) + 100)

      const homeEdge = homeProb - homeImplied
      const awayEdge = awayProb - awayImplied

      if (homeEdge > EDGE_THRESHOLD) {
        edges.push({
          gameId: prediction.gameId,
          matchKey: prediction.matchKey || gameOdds.matchKey,
          team: prediction.homeTeam,
          market: "moneyline",
          sportsbook: gameOdds.sportsbook,
          odds: homeOdds,
          modelProbability: homeProb,
          impliedProbability: Number(homeImplied.toFixed(4)),
          edge: Number(homeEdge.toFixed(4)),
          threshold: EDGE_THRESHOLD,
          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          lastUpdated: gameOdds.lastUpdated
        })
      }

      if (awayEdge > EDGE_THRESHOLD) {
        edges.push({
          gameId: prediction.gameId,
          matchKey: prediction.matchKey || gameOdds.matchKey,
          team: prediction.awayTeam,
          market: "moneyline",
          sportsbook: gameOdds.sportsbook,
          odds: awayOdds,
          modelProbability: awayProb,
          impliedProbability: Number(awayImplied.toFixed(4)),
          edge: Number(awayEdge.toFixed(4)),
          threshold: EDGE_THRESHOLD,
          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          lastUpdated: gameOdds.lastUpdated
        })
      }

    })

    await redis.set("mlb:edges:today", edges)

    res.status(200).json({
      edgesFound: edges.length,
      sample: edges.slice(0,5)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
