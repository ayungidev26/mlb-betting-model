export const DEFAULT_EDGE_THRESHOLD = 0

export function getGameBetType(game) {
  const market = game?.market || game?.betType || game?.recommendedMarket || "moneyline"

  return typeof market === "string" && market.trim()
    ? market.trim().toLowerCase()
    : "moneyline"
}

export function getAvailableBetTypes(games = []) {
  const betTypes = new Set()

  for (const game of games) {
    betTypes.add(getGameBetType(game))
  }

  return Array.from(betTypes).sort((left, right) => left.localeCompare(right))
}

export function getAvailableTeams(games = []) {
  const teams = new Set()

  for (const game of games) {
    if (typeof game?.awayTeam === "string" && game.awayTeam.trim()) {
      teams.add(game.awayTeam.trim())
    }

    if (typeof game?.homeTeam === "string" && game.homeTeam.trim()) {
      teams.add(game.homeTeam.trim())
    }
  }

  return Array.from(teams).sort((left, right) => left.localeCompare(right))
}

export function filterGames(games = [], filters = {}) {
  const minimumEdge = typeof filters.minimumEdge === "number"
    ? filters.minimumEdge
    : DEFAULT_EDGE_THRESHOLD
  const selectedBetType = typeof filters.betType === "string"
    ? filters.betType.trim().toLowerCase()
    : "all"
  const selectedTeam = typeof filters.team === "string"
    ? filters.team.trim()
    : "all"

  return games.filter((game) => {
    const edge = typeof game?.edge === "number" ? game.edge : Number.NEGATIVE_INFINITY
    const betType = getGameBetType(game)
    const matchesEdge = edge >= minimumEdge
    const matchesBetType = selectedBetType === "all" || betType === selectedBetType
    const matchesTeam = selectedTeam === "all"
      || game?.awayTeam === selectedTeam
      || game?.homeTeam === selectedTeam

    return matchesEdge && matchesBetType && matchesTeam
  })
}
