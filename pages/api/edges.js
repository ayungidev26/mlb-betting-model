import { redis } from "../../lib/upstash.js"
import { getCachedEdges } from "../../lib/cachedEdges.js"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  try {
    const edges = await getCachedEdges(redis)
    let metadata = null
    try { metadata = await redis.get("mlb:edges:today:meta") } catch { /* legacy/mock cache */ }

    return res.status(200).json({
      edges,
      metadata,
      summary: {
        edgesFound: edges.length,
        message: edges.length > 0
          ? "Showing cached edges."
          : "No cached edges are available yet."
      }
    })
  } catch (_error) {
    return res.status(503).json({
      error: "Cached edges are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
