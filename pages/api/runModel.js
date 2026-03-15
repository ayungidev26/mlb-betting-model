import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    // Load team ratings
    const ratings = await redis.get("mlb_team_ratings")

    if (!ratings) {
      return res.status(400).json({
        error: "Team ratings not found. Run /api/buildRatings first."
      })
    }

    // Fetch today's games from our API
    const gamesResponse = await fetch(
      "https://mlb-betting-model.vercel.app/api/fetchGames"
    )

    const gamesData = await gamesResponse.json()

    const games = gamesData.games

    // Only evaluate regular season games
    const regularGames =
      games.filter(g => g.seasonType === "regular")

    const predictions = regularGames.map(game => {

      const homeRating = ratings[game.homeTeam] || 1500
      const awayRating = ratings[game.awayTeam] || 1500

      const homeAdvantage = 40

      const homeAdjusted = homeRating + homeAdvantage

      const homeProbability =
        1 / (1 + Math.pow(10, (awayRating - homeAdjusted) / 400))

      const awayProbability = 1 - homeProbability

      return {
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeRating: Math.round(homeRating),
        awayRating: Math.round(awayRating),
        homeWinProbability: Number(
          (homeProbability * 100).toFixed(2)
        ),
        awayWinProbability: Number(
          (awayProbability * 100).toFixed(2)
        )
      }

    })

    res.status(200).json({
      gamesEvaluated: predictions.length,
      predictions: predictions
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
