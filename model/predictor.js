import { redis } from "../lib/upstash"

export async function predictGame(game) {

  const ratings = await redis.get("mlb_team_ratings")

  const homeRating = ratings[game.homeTeam] || 1500
  const awayRating = ratings[game.awayTeam] || 1500

  const homeProb =
    1 / (1 + Math.pow(10, (awayRating - homeRating) / 400))

  return {
    homeWinProb: homeProb,
    awayWinProb: 1 - homeProb
  }

}
