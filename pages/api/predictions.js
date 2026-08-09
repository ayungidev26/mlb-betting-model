import { redis } from "../../lib/upstash.js"
import { getCachedPredictions } from "../../lib/cachedPredictions.js"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  try {
    const predictions = await getCachedPredictions(redis)
    let metadata = null
    try { metadata = await redis.get("mlb:predictions:today:meta") } catch { /* legacy/mock cache */ }

    return res.status(200).json({
      predictions,
      metadata,
      summary: {
        predictionsCreated: predictions.length,
        message: predictions.length > 0
          ? "Showing cached predictions."
          : "No cached predictions are available yet."
      }
    })
  } catch (_error) {
    return res.status(503).json({
      error: "Cached predictions are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
