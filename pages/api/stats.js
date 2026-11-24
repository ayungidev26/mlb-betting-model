import { redis } from "../../lib/upstash.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"
import { getStatsSeason, loadStatsSeason, parseStatsSeason } from "../../lib/seasonStats.js"

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store")
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  const currentSeason = Number(getEasternDateKey().slice(0, 4))
  const requestedSeason = parseStatsSeason(req.query?.season)
  if (req.query?.season != null && (!requestedSeason || requestedSeason > currentSeason)) {
    return res.status(400).json({ error: "Select a valid MLB season." })
  }

  try {
    const [stats, gamesMeta] = await Promise.all([
      loadStatsSeason(redis, requestedSeason, currentSeason),
      redis.get("mlb:games:today:meta")
    ])
    const slateSeason = getStatsSeason(gamesMeta) ?? parseStatsSeason(gamesMeta?.fetchedAt?.slice(0, 4))

    return res.status(200).json({
      ...stats,
      todaySlateFetchedAt: slateSeason === stats.season ? gamesMeta.fetchedAt ?? null : null
    })
  } catch {
    return res.status(503).json({
      error: "Cached stats are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
