import { calculatePitcherRating } from "./pitcherRatings"

export function predictGame(game, teamRatings) {

  // Team ratings
  const homeTeamRating = teamRatings[game.homeTeam] || 1500
  const awayTeamRating = teamRatings[game.awayTeam] || 1500

  // Starting pitcher ratings
  const homePitcherRating = calculatePitcherRating(game.homePitcher)
  const awayPitcherRating = calculatePitcherRating(game.awayPitcher)

  // Home field advantage (MLB average)
  const homeFieldAdvantage = 25

  // Adjusted team strength
  const homeStrength =
    homeTeamRating +
    homePitcherRating +
    homeFieldAdvantage

  const awayStrength =
    awayTeamRating +
    awayPitcherRating

  // Convert to win probability (ELO formula)
  const homeWinProbability =
    1 / (1 + Math.pow(10, (awayStrength - homeStrength) / 400))

  const awayWinProbability = 1 - homeWinProbability

  return {
    gameId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,

    homePitcher: game.homePitcher,
    awayPitcher: game.awayPitcher,

    homeStrength,
    awayStrength,

    homeWinProbability,
    awayWinProbability
  }

}
