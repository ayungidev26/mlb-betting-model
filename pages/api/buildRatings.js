import { redis } from "../../lib/upstash"
import { calculateElo } from "../../model/eloRatings"

export default async function handler(req, res) {

  try {

    // Load historical games dataset
    const games = await redis.get("mlb:historical:games")

    if (!games || games.length === 0) {
      return res.status(400).json({
        error: "No historical games found"
      })
    }

    // Calculate team ELO ratings
    const ratings = calculateElo(games)

    // Store ratings in Redis
    await redis.set("mlb:ratings:teams", ratings)

    res.status(200).json({
      gamesUsed: games.length,
      teamsRated: Object.keys(ratings).length,
      ratingsSample: Object.entries(ratings).slice(0,5)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
