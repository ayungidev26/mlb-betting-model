import { getPitcherRating } from "./pitcherRatings"
import { getBullpenRating } from "./bullpenRatings"

export async function predictGame(game, teamRatings) {

  const homeTeam = game.homeTeam
  const awayTeam = game.awayTeam

  const homeTeamRating = teamRatings[homeTeam] || 1500
  const awayTeamRating = teamRatings[awayTeam] || 1500

  const homePitcherRating =
    await getPitcherRating(game.homePitcher)

  const awayPitcherRating =
    await getPitcherRating(game.awayPitcher)

  const homeBullpenRating =
    await getBullpenRating(homeTeam)

  const awayBullpenRating =
    await getBullpenRating(awayTeam)

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

    homeTeam,
    awayTeam,

    homePitcher: game.homePitcher,
    awayPitcher: game.awayPitcher,

    homeRating,
    awayRating,

    homeWinProbability,
    awayWinProbability

  }

}
