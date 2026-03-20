// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"
import { sendRouteError } from "../../lib/apiErrors"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {

    const url =
      "https://statsapi.mlb.com/api/v1/teams?sportId=1"

    const response = await fetch(url)
    const data = await response.json()

    const bullpenStats = {}

    for (const team of data.teams) {

      const statsUrl =
        `https://statsapi.mlb.com/api/v1/teams/${team.id}/stats?stats=season&group=pitching`

      const statsRes = await fetch(statsUrl)
      const statsData = await statsRes.json()

      const stat =
        statsData.stats?.[0]?.splits?.[0]?.stat

      if (!stat) continue

      bullpenStats[team.name] = {
        era: parseFloat(stat.era),
        whip: parseFloat(stat.whip)
      }

    }

    await redis.set("mlb:stats:bullpen", bullpenStats)

    res.status(200).json({
      teamsCollected: Object.keys(bullpenStats).length,
      sample: Object.entries(bullpenStats).slice(0,3)
    })

  } catch (error) {
    return sendRouteError(res, "fetchBullpenStats", error)
  }

}
