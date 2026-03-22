// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { generatePredictions } from "../../lib/pipeline.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"

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
    return sendRouteError(res, "runModel", error)
  }

}
