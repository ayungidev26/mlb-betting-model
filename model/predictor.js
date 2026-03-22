import { getPitcherRatingDetails } from "./pitcherRatings.js"
import { getBullpenRating } from "./bullpenRatings.js"

export async function predictGame(game, teamRatings, bullpenStats, pitcherStats = null) {
  try {
    const homeTeam = game.homeTeam
    const awayTeam = game.awayTeam

    // Team base ratings
    const homeTeamRating = teamRatings?.[homeTeam] || 1500
    const awayTeamRating = teamRatings?.[awayTeam] || 1500

    // Pitcher ratings and feature inputs
    const homePitcherDetails =
      await getPitcherRatingDetails(game.homePitcher, pitcherStats)
    const awayPitcherDetails =
      await getPitcherRatingDetails(game.awayPitcher, pitcherStats)

    const homePitcherRating = homePitcherDetails.rating
    const awayPitcherRating = awayPitcherDetails.rating

    // Bullpen ratings
    const homeBullpenRating =
      getBullpenRating(homeTeam, bullpenStats)

    const awayBullpenRating =
      getBullpenRating(awayTeam, bullpenStats)

    // Home field advantage
    const HOME_FIELD = 25

    const homeRating =
      homeTeamRating +
      homePitcherRating +
      homeBullpenRating +
      HOME_FIELD

    const awayRating =
      awayTeamRating +
      awayPitcherRating +
      awayBullpenRating

    const ratingDiff = homeRating - awayRating

    // Elo probability formula
    const homeWinProbability =
      1 / (1 + Math.pow(10, (-ratingDiff / 400)))

    const awayWinProbability =
      1 - homeWinProbability

    return {
      gameId: game.gameId,
      matchKey: game.matchKey || null,
      date: game.date || null,

      homeTeam,
      awayTeam,

      homePitcher: game.homePitcher || null,
      awayPitcher: game.awayPitcher || null,

      homeRating,
      awayRating,

      pitcherModel: {
        home: {
          name: game.homePitcher || null,
          rating: homePitcherRating,
          stats: homePitcherDetails.stats,
          components: homePitcherDetails.components
        },
        away: {
          name: game.awayPitcher || null,
          rating: awayPitcherRating,
          stats: awayPitcherDetails.stats,
          components: awayPitcherDetails.components
        }
      },

      homeWinProbability: Number(homeWinProbability.toFixed(4)),
      awayWinProbability: Number(awayWinProbability.toFixed(4))
    }
  } catch (error) {
    console.error("Prediction error:", error)

    return null
  }
}
