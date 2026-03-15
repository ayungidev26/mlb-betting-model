export function calculateElo(games) {

  const ratings = {}
  const K = 20
  const HOME_ADVANTAGE = 40

  games.forEach(game => {

    const home = game.homeTeam
    const away = game.awayTeam

    if (!ratings[home]) ratings[home] = 1500
    if (!ratings[away]) ratings[away] = 1500

    const homeRating = ratings[home] + HOME_ADVANTAGE
    const awayRating = ratings[away]

    const expectedHome =
      1 / (1 + Math.pow(10, (awayRating - homeRating) / 400))

    const expectedAway = 1 - expectedHome

    const homeWin = game.homeScore > game.awayScore ? 1 : 0
    const awayWin = 1 - homeWin

    ratings[home] =
      ratings[home] + K * (homeWin - expectedHome)

    ratings[away] =
      ratings[away] + K * (awayWin - expectedAway)

  })

  return ratings
}
