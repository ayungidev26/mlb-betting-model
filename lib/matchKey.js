import { normalizeMlbTeamName } from "./teamNames.js"

export function buildMatchKey(dateInput, awayTeam, homeTeam) {
  if (!dateInput || !awayTeam || !homeTeam) {
    return null
  }

  const parsedDate = new Date(dateInput)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  const gameDate = parsedDate.toISOString().split("T")[0]
  const normalizedAwayTeam = normalizeMlbTeamName(awayTeam)
  const normalizedHomeTeam = normalizeMlbTeamName(homeTeam)

  if (!normalizedAwayTeam || !normalizedHomeTeam) {
    return null
  }

  return `${gameDate}|${normalizedAwayTeam}|${normalizedHomeTeam}`
}
