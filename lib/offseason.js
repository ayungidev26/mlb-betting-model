import { getEasternDateKey } from "./cronSchedule.js"
import { fetchJsonWithRetry } from "./upstreamFetch.js"

export function getMostRecentCompletedSeason(dateKey = getEasternDateKey()) {
  const year = Number(dateKey.slice(0, 4))
  return Number(dateKey.slice(5, 7)) >= 11 ? year : year - 1
}

export async function loadEmptySlate(redisClient, dateKey, fetchImpl = fetch) {
  const year = dateKey.slice(0, 4)
  let calendar
  try {
    const payload = await fetchJsonWithRetry(`https://statsapi.mlb.com/api/v1/seasons/${year}?sportId=1`, {
      fetchImpl, timeoutMs: 2500, retries: 0
    })
    calendar = payload.seasons?.find((entry) => entry.seasonId === year)
  } catch {
    return { status: "empty" }
  }

  const isCalendarDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const { offseasonStartDate, offSeasonEndDate, seasonStartDate } = calendar || {}
  const afterSeason = isCalendarDate(offseasonStartDate) && isCalendarDate(offSeasonEndDate)
    && dateKey >= offseasonStartDate && dateKey <= offSeasonEndDate
  const beforeSeason = isCalendarDate(seasonStartDate) && dateKey < seasonStartDate
  if (!afterSeason && !beforeSeason) return { status: "empty" }

  const season = Number(year) - (afterSeason ? 0 : 1)
  try {
    const closeout = await redisClient.get(`mlb:seasonSummary:${season}`)
    return { status: "offseason", season, closeout: closeout?.season === season ? closeout : null }
  } catch {
    return { status: "offseason", season, closeout: null }
  }
}
