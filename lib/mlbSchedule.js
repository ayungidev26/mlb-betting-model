import { getEasternDateKey } from "./cronSchedule.js"

export function buildMlbScheduleUrl(dateKey = getEasternDateKey()) {
  return `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateKey}&hydrate=probablePitcher`
}
