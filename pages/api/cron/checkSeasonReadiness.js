import { getOperationalRouteSecret, requireCronOrOperationalRouteAccess } from "../../../lib/apiSecurity.js"
import { getMissingAuthEnvironmentVariables } from "../../../lib/authConfig.js"
import { getRatingsFreshness } from "../../../lib/cacheFreshness.js"
import { getEasternDateKey } from "../../../lib/cronSchedule.js"
import { getMostRecentCompletedSeason } from "../../../lib/offseason.js"
import { validateSeasonFeeds } from "../../../lib/productionValidation.js"
import { redis } from "../../../lib/upstash.js"
import runWeeklyRatingsRefresh from "./runWeeklyRatingsRefresh.js"

export default async function handler(req, res) {
  if (!requireCronOrOperationalRouteAccess(req, res)) return

  const dateKey = getEasternDateKey()
  const season = getMostRecentCompletedSeason(dateKey)
  const preseason = req.query?.preseason === "true"
  const checkOdds = preseason && req.query?.checkOdds === "true"
  const missingConfiguration = getMissingAuthEnvironmentVariables()
  for (const key of ["DEPLOYMENT_ORIGIN", "ODDS_API_KEY"]) {
    if (!process.env[key]?.trim()) missingConfiguration.push(key)
  }

  try {
    const [summary, ratings, feeds] = await Promise.all([
      redis.get(`mlb:seasonSummary:${season}`),
      redis.get("mlb:ratings:teams:meta"),
      validateSeasonFeeds({ season, preseason, checkOdds })
    ])
    const closeoutVerified = summary?.season === season && summary.finalGames > 0
    const healthy = missingConfiguration.length === 0 && feeds.every(feed => feed.success)
    if (healthy && preseason && dateKey.slice(5, 7) === "03" && closeoutVerified && !getRatingsFreshness(ratings).fresh) {
      // Refresh through the same locking and source-validation path as the scheduled build.
      return runWeeklyRatingsRefresh({
        ...req, query: { force: "true" },
        headers: { authorization: `Bearer ${getOperationalRouteSecret()}` }
      }, res)
    }
    const ready = healthy && (!preseason || closeoutVerified)
    return res.status(ready ? 200 : 503).json({
      ok: ready, preseason, season, closeoutVerified,
      lastFinalDate: summary?.dataThrough ?? null, missingConfiguration, feeds
    })
  } catch {
    return res.status(503).json({ ok: false, error: "Season readiness checks could not be completed" })
  }
}
