import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { redis } from "../../lib/upstash.js"
import { validateProductionIntegrations } from "../../lib/productionValidation.js"

// Dormant, authenticated production-only diagnostic. It never invokes a loader
// or writes application data; The Odds API is called no more than once per run.
export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) return

  if (process.env.PRODUCTION_VALIDATION_ENABLED !== "true") {
    return res.status(404).json({ error: "Production validation tooling is disabled" })
  }

  const results = await validateProductionIntegrations({ redisClient: redis })
  const success = results.every(result => result.success)
  return res.status(success ? 200 : 502).json({ success, results })
}
