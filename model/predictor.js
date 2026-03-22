import { getPitcherRatingDetails } from "./pitcherRatings.js"
import { getBullpenRatingDetails } from "./bullpenRatings.js"
import { getOffenseRatingDetails } from "./offenseRatings.js"

function resolveOpposingPitcherHand(pitcherName, pitcherStats) {
  if (!pitcherName || !pitcherStats || typeof pitcherStats !== "object") {
    return null
  }

  const throwingHand = pitcherStats?.[pitcherName]?.throwingHand || null
  return typeof throwingHand === "string" && throwingHand.length > 0 ? throwingHand : null
}

export async function predictGame(game, teamRatings, bullpenStats, pitcherStats = null, offenseStats = null) {
  try {
    const homeTeam = game.homeTeam
    const awayTeam = game.awayTeam

    const homeTeamRating = teamRatings?.[homeTeam] || 1500
    const awayTeamRating = teamRatings?.[awayTeam] || 1500

    const homePitcherDetails =
      await getPitcherRatingDetails(game.homePitcher, pitcherStats)
    const awayPitcherDetails =
      await getPitcherRatingDetails(game.awayPitcher, pitcherStats)

    const homePitcherRating = homePitcherDetails.rating
    const awayPitcherRating = awayPitcherDetails.rating

    const homeBullpenDetails =
      getBullpenRatingDetails(homeTeam, bullpenStats)

    const awayBullpenDetails =
      getBullpenRatingDetails(awayTeam, bullpenStats)

    const homeBullpenRating = homeBullpenDetails.rating
    const awayBullpenRating = awayBullpenDetails.rating

    const homeOffenseDetails = getOffenseRatingDetails(homeTeam, offenseStats, {
      isHomeTeam: true,
      opposingPitcherHand: resolveOpposingPitcherHand(game.awayPitcher, pitcherStats)
    })
    const awayOffenseDetails = getOffenseRatingDetails(awayTeam, offenseStats, {
      isHomeTeam: false,
      opposingPitcherHand: resolveOpposingPitcherHand(game.homePitcher, pitcherStats)
    })

    const homeOffenseRating = homeOffenseDetails.rating
    const awayOffenseRating = awayOffenseDetails.rating

    const HOME_FIELD = 25

    const homeRating =
      homeTeamRating +
      homePitcherRating +
      homeBullpenRating +
      homeOffenseRating +
      HOME_FIELD

    const awayRating =
      awayTeamRating +
      awayPitcherRating +
      awayBullpenRating +
      awayOffenseRating

    const ratingDiff = homeRating - awayRating

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

      bullpenModel: {
        home: {
          rating: homeBullpenRating,
          stats: homeBullpenDetails.stats,
          components: homeBullpenDetails.components
        },
        away: {
          rating: awayBullpenRating,
          stats: awayBullpenDetails.stats,
          components: awayBullpenDetails.components
        }
      },

      offenseModel: {
        home: {
          rating: homeOffenseRating,
          stats: homeOffenseDetails.stats,
          components: homeOffenseDetails.components,
          derived: homeOffenseDetails.derived
        },
        away: {
          rating: awayOffenseRating,
          stats: awayOffenseDetails.stats,
          components: awayOffenseDetails.components,
          derived: awayOffenseDetails.derived
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
