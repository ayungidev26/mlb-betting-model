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

    const edges = []

    predictions.forEach(prediction => {

      const gameOdds = odds.find(
        game => game.gameId === prediction.gameId
      )

      if (!gameOdds) return

      const homeOdds = gameOdds.homeMoneyline
      const awayOdds = gameOdds.awayMoneyline

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

      if (homeEdge > 0.03) {
        edges.push({
          gameId: prediction.gameId,
          team: prediction.homeTeam,
          edge: homeEdge,
          odds: homeOdds,
          sportsbook: gameOdds.sportsbook
        })
      }

      if (awayEdge > 0.03) {
        edges.push({
          gameId: prediction.gameId,
          team: prediction.awayTeam,
          edge: awayEdge,
          odds: awayOdds,
          sportsbook: gameOdds.sportsbook
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
