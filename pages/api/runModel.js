// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { predictGame } from "../../model/predictor"

export default async function handler(req, res) {

  try {

    // Load today's games
    const games = await redis.get("mlb:games:today")

    if (!games || games.length === 0) {
      return res.status(200).json({
        message: "No games today"
      })
    }

    // Load team ratings
    const teamRatings = await redis.get("mlb:ratings:teams")

    if (!teamRatings) {
      return res.status(400).json({
        error: "Team ratings not found"
      })
    }

    // Load bullpen stats populated by the dedicated ingestion route
    const bullpenStats = await redis.get("mlb:stats:bullpen")

    const predictions = []

    // Generate predictions
    for (const game of games) {

      const prediction = await predictGame(
        game,
        teamRatings,
        bullpenStats
      )
      // skip failed predictions
      if (!prediction) continue

      predictions.push({
        ...prediction,
        matchKey: game.matchKey || prediction.matchKey || null
      })

    }

    // Store predictions for today
    await redis.set("mlb:predictions:today", predictions)

    // Store prediction history
    const today = new Date().toISOString().split("T")[0]

    await redis.set(
      `mlb:predictions:${today}`,
      predictions
    )

    res.status(200).json({
      predictionsCreated: predictions.length,
      sample: predictions.slice(0,3)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
