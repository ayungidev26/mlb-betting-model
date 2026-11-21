import { getEasternDateKey } from "./cronSchedule.js"

export function getMostRecentCompletedSeason(dateKey = getEasternDateKey()) {
  const year = Number(dateKey.slice(0, 4))
  return Number(dateKey.slice(5, 7)) >= 11 ? year : year - 1
}

export async function loadEmptySlate(redisClient, dateKey = getEasternDateKey()) {
  const slate = await redisClient.get("mlb:games:today:meta")
  if (slate?.dateKey !== dateKey || slate.gamesToday !== 0) return null

  const month = Number(dateKey.slice(5, 7))
  if (month >= 3 && month <= 10) return { season: null, closeout: null }

  const season = getMostRecentCompletedSeason(dateKey)
  const closeout = await redisClient.get(`mlb:seasonSummary:${season}`)
  return { season, closeout: closeout?.season === season ? closeout : null }
}
