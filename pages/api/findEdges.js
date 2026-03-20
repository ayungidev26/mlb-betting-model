// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { generateEdges } from "../../lib/pipeline"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {

    const { edges, matchedGames, unmatchedPredictions } = await generateEdges(redis)

    res.status(200).json({
      edgesFound: edges.length,
      matchedGames,
      unmatchedPredictions,
      sample: edges.slice(0,5)
    })

  } catch (error) {

    const statusCode = error.message === "Missing predictions or odds data"
      ? 400
      : 500

    res.status(statusCode).json({
      error: error.message
    })

  }

}
