import { getEasternDateKey } from "./cronSchedule.js"
import { fetchJsonWithRetry } from "./upstreamFetch.js"

export function getMostRecentCompletedSeason(dateKey = getEasternDateKey()) {
  const year = Number(dateKey.slice(0, 4))
  return Number(dateKey.slice(5, 7)) >= 11 ? year : year - 1
}

async function loadSeasonCalendar(year, fetchImpl) {
  try {
    const payload = await fetchJsonWithRetry(`https://statsapi.mlb.com/api/v1/seasons/${year}?sportId=1`, {
      fetchImpl, timeoutMs: 2500, retries: 0
    })
    return payload.seasons?.find((entry) => entry.seasonId === year) ?? null
  } catch {
    return null
  }
}

export async function loadSeasonCloseout(redisClient, season) {
  try {
    const closeout = await redisClient.get(`mlb:seasonSummary:${season}`)
    return closeout?.season === season ? closeout : null
  } catch {
    return null
  }
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function loadEmptySlate(redisClient, dateKey, fetchImpl = fetch) {
  const year = dateKey.slice(0, 4)
  const calendar = await loadSeasonCalendar(year, fetchImpl)
  const { offseasonStartDate, offSeasonEndDate, seasonStartDate } = calendar || {}
  const afterSeason = isCalendarDate(offseasonStartDate) && isCalendarDate(offSeasonEndDate)
    && dateKey >= offseasonStartDate && dateKey <= offSeasonEndDate
  const beforeSeason = isCalendarDate(seasonStartDate) && dateKey < seasonStartDate
  if (!afterSeason && !beforeSeason) return { status: "empty" }

  const season = Number(year) - (afterSeason ? 0 : 1)
  const upcomingYear = String(season + 1)
  const [closeout, upcomingCalendar] = await Promise.all([
    loadSeasonCloseout(redisClient, season),
    afterSeason ? loadSeasonCalendar(upcomingYear, fetchImpl) : calendar
  ])
  const openingDate = upcomingCalendar?.regularSeasonStartDate
  const nextRegularSeasonDate = isCalendarDate(openingDate) && openingDate.startsWith(`${upcomingYear}-`)
    && openingDate > dateKey ? openingDate : null

  return { status: "offseason", season, closeout, nextRegularSeasonDate }
}
