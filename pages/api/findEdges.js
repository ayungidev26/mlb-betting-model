// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { findEdgesFromData } from "../../lib/findEdges"

export default async function handler(req, res) {

  try {

    const predictions = await redis.get("mlb:predictions:today")
    const odds = await redis.get("mlb:odds:today")

    if (!predictions || !odds) {
      return res.status(400).json({
        error: "Missing predictions or odds data"
      })
    }

    const { edges, matchedGames, unmatchedPredictions } = findEdgesFromData(
      predictions,
      odds
    )

    await redis.set("mlb:edges:today", edges)

    res.status(200).json({
      edgesFound: edges.length,
      matchedGames,
      unmatchedPredictions,
      sample: edges.slice(0,5)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
