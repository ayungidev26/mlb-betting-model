export function calculateElo(games) {

  const ratings = {}

  const BASE_RATING = 1500
  const K = 20

  const currentYear = new Date().getFullYear()

  for (const game of games) {

    const home = game.homeTeam
    const away = game.awayTeam

    if (!ratings[home]) ratings[home] = BASE_RATING
    if (!ratings[away]) ratings[away] = BASE_RATING

    const homeRating = ratings[home]
    const awayRating = ratings[away]

    const expectedHome =
      1 / (1 + Math.pow(10, (awayRating - homeRating) / 400))

    const homeWin = game.homeScore > game.awayScore ? 1 : 0

    // ----- TIME DECAY -----
    const yearsOld = currentYear - game.season

    let weight = 1

    if (yearsOld === 1) weight = 0.85
    if (yearsOld === 2) weight = 0.70
    if (yearsOld === 3) weight = 0.55
    if (yearsOld >= 4) weight = 0.40
    // ----------------------

    const adjustment = K * weight * (homeWin - expectedHome)

    ratings[home] += adjustment
    ratings[away] -= adjustment

  }

  return ratings
}
