// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { generateEdges } from "../../lib/pipeline"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"
import { sendRouteError } from "../../lib/apiErrors"

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
    return sendRouteError(res, "findEdges", error)
  }

}
