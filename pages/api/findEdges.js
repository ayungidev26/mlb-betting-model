import { redis } from "../../lib/upstash"
import { predictGame } from "../../model/predictor"

function americanToProbability(odds) {

  if (odds > 0) {
    return 100 / (odds + 100)
  }

  return Math.abs(odds) / (Math.abs(odds) + 100)

}

export default async function handler(req, res) {

  try {

    const games = await redis.get("mlb:games:today")
    const odds = await redis.get("mlb:odds:today")

    if (!games || !odds) {
      return res.status(400).json({
        error: "Missing games or odds data"
      })
    }

    const edges = []

    for (const game of games) {

      const gameOdds = odds.find(o =>
        o.homeTeam === game.homeTeam &&
        o.awayTeam === game.awayTeam
      )

      if (!gameOdds) continue

      const prediction = await predictGame(game)

      for (const book of gameOdds.sportsbooks) {

        const homeProb = prediction.homeWinProb
        const awayProb = prediction.awayWinProb

        const homeImplied = americanToProbability(book.homeOdds)
        const awayImplied = americanToProbability(book.awayOdds)

        const homeEdge = homeProb - homeImplied
        const awayEdge = awayProb - awayImplied

        if (homeEdge > 0.03) {
          edges.push({
            gameId: game.gameId,
            team: game.homeTeam,
            opponent: game.awayTeam,
            sportsbook: book.sportsbook,
            odds: book.homeOdds,
            modelProb: homeProb,
            impliedProb: Number(homeImplied.toFixed(3)),
            edge: Number(homeEdge.toFixed(3))
          })
        }

        if (awayEdge > 0.03) {
          edges.push({
            gameId: game.gameId,
            team: game.awayTeam,
            opponent: game.homeTeam,
            sportsbook: book.sportsbook,
            odds: book.awayOdds,
            modelProb: awayProb,
            impliedProb: Number(awayImplied.toFixed(3)),
            edge: Number(awayEdge.toFixed(3))
          })
        }

      }

    }

    // Store results
    await redis.set("mlb:model:edges", edges)

    res.status(200).json({
      edgesFound: edges.length,
      edges: edges.slice(0,10)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
