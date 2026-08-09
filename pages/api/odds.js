import { redis } from "../../lib/upstash.js"
import { getCachedOdds } from "../../lib/cachedOdds.js"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  try {
    const odds = await getCachedOdds(redis)
    let metadata = null
    try { metadata = await redis.get("mlb:odds:today:meta") } catch { /* legacy/mock cache */ }

    return res.status(200).json({
      odds,
      metadata,
      summary: {
        games: odds.length,
        message: odds.length > 0
          ? "Showing cached odds."
          : "No cached odds are available yet."
      }
    })
  } catch (_error) {
    return res.status(503).json({
      error: "Cached odds are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
