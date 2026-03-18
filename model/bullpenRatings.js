function toNumber(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calculateBullpenRating(bullpen) {
  const era = toNumber(bullpen?.era)
  const whip = toNumber(bullpen?.whip)

  if (era === null || whip === null) return 0

  let rating = 0

  if (era < 3) rating += 70
  else if (era < 3.5) rating += 50
  else if (era < 4) rating += 30
  else if (era < 4.5) rating += 15

  if (whip < 1.1) rating += 40
  else if (whip < 1.2) rating += 25
  else if (whip < 1.3) rating += 15
  else if (whip < 1.4) rating += 5

  return rating
}

export function getBullpenRating(teamName, bullpenStats) {
  if (!teamName || !bullpenStats || typeof bullpenStats !== "object") return 0

  const bullpen = bullpenStats[teamName]

  if (!bullpen || typeof bullpen !== "object") return 0

  return calculateBullpenRating(bullpen)
}

export { calculateBullpenRating }
