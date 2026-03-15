import { redis } from "../../lib/upstash"
import { predictGame } from "../../model/predictor"

function americanToProbability(odds) {

  if (odds > 0) {
    return 100 / (odds + 100)
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100)
  }

}

export default async function handler(req, res) {

  try {

    const games = await redis.get("mlb_games_today")
    const odds = await redis.get("mlb_odds_today")

    if (!games || !odds) {
      return res.status(400).json({
        error: "Missing games or odds data"
      })
    }

    const edges = []

    for (const game of games) {

      const oddsGame = odds.find(
        o =>
          o.homeTeam === game.homeTeam &&
          o.awayTeam === game.awayTeam
      )

      if (!oddsGame) continue

      const prediction = predictGame(game)

      let bestHomeOdds = -9999
      let bestAwayOdds = -9999
      let bestHomeBook = null
      let bestAwayBook = null

      const books = oddsGame.sportsbooks.map(book => {

        if (book.homeOdds > bestHomeOdds) {
          bestHomeOdds = book.homeOdds
          bestHomeBook = book.sportsbook
        }

        if (book.awayOdds > bestAwayOdds) {
          bestAwayOdds = book.awayOdds
          bestAwayBook = book.sportsbook
        }

        return {
          sportsbook: book.sportsbook,
          homeOdds: book.homeOdds,
          awayOdds: book.awayOdds
        }

      })

      const impliedHome = americanToProbability(bestHomeOdds)
      const impliedAway = americanToProbability(bestAwayOdds)

      const homeEdge =
        prediction.homeWinProb - impliedHome

      const awayEdge =
        prediction.awayWinProb - impliedAway

      edges.push({

        gameDate: game.gameDate,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,

        model: {
          homeWinProb: prediction.homeWinProb,
          awayWinProb: prediction.awayWinProb
        },

        bestOdds: {
          homeOdds: bestHomeOdds,
          awayOdds: bestAwayOdds,
          homeSportsbook: bestHomeBook,
          awaySportsbook: bestAwayBook
        },

        impliedProbability: {
          home: impliedHome,
          away: impliedAway
        },

        edge: {
          homeEdge,
          awayEdge
        },

        sportsbooks: books

      })

    }

    return res.status(200).json({
      gamesAnalyzed: edges.length,
      edges
    })

  } catch (error) {

    return res.status(500).json({
      error: error.message
    })

  }

}
