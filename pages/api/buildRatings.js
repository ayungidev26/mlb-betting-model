import { redis } from "../../lib/upstash"
import { calculateElo } from "../../model/eloRatings"

export default async function handler(req, res) {

  try {

    // Load all historical games
    const games = await redis.lrange("mlb_games", 0, -1)

    // games are already JSON objects with Upstash
    const ratings = calculateElo(games)

    // Save ratings back to Redis
    await redis.set("mlb_team_ratings", ratings)

    res.status(200).json({
      teamsRated: Object.keys(ratings).length,
      ratingsSample: Object.entries(ratings).slice(0,5)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
