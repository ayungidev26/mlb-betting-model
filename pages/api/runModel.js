import { redis } from "../../lib/upstash"
import { predictGame } from "../../model/predictor"

export default async function handler(req, res) {

  try {

    // Load today's games
    const games = await redis.get("mlb:games:today")

    if (!games || games.length === 0) {
      return res.status(200).json({
        message: "No games found",
        predictions: []
      })
    }

    // Load team ratings
    const teamRatings = await redis.get("mlb:ratings:teams")

    if (!teamRatings) {
      return res.status(400).json({
        error: "Team ratings not found"
      })
    }

    // Generate predictions
    const predictions = games.map(game =>
      predictGame(game, teamRatings)
    )

    // Save predictions to Redis
    await redis.set("mlb:predictions:today", predictions)

    res.status(200).json({
      gamesProcessed: predictions.length,
      sample: predictions.slice(0,3)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
