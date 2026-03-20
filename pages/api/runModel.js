// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { generatePredictions } from "../../lib/pipeline"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {

    const result = await generatePredictions(redis)

    if (result.message) {
      return res.status(200).json({
        message: result.message
      })
    }

    res.status(200).json({
      predictionsCreated: result.predictionsCreated,
      sample: result.sample
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
