// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import fetchGamesHandler from "./fetchGames"
import fetchOddsHandler from "./fetchOdds"
import fetchPitcherStatsHandler from "./fetchPitcherStats"
import fetchBullpenStatsHandler from "./fetchBullpenStats"
import runModelHandler from "./runModel"
import findEdgesHandler from "./findEdges"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    }
  }
}

async function invokeStep(handler, options = {}) {
  const req = {
    method: options.method || "POST",
    query: options.query || {},
    headers: options.headers || {}
  }
  const res = createMockResponse()

  try {
    await handler(req, res)

    return {
      ok: res.statusCode < 400,
      statusCode: res.statusCode,
      body: res.body
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      body: {
        error: error.message
      }
    }
  }
}

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  const pipeline = [
    {
      name: "fetchGames",
      handler: fetchGamesHandler
    },
    {
      name: "fetchOdds",
      handler: fetchOddsHandler,
      query: {
        refresh: "true"
      }
    },
    {
      name: "fetchPitcherStats",
      handler: fetchPitcherStatsHandler
    },
    {
      name: "fetchBullpenStats",
      handler: fetchBullpenStatsHandler
    },
    {
      name: "runModel",
      handler: runModelHandler
    },
    {
      name: "findEdges",
      handler: findEdgesHandler
    }
  ]

  const steps = []

  for (const step of pipeline) {
    const result = await invokeStep(step.handler, {
      method: req.method,
      query: step.query,
      headers: req.headers
    })

    steps.push({
      step: step.name,
      status: result.ok ? "success" : "failed",
      statusCode: result.statusCode,
      result: result.body
    })

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        completedSteps: steps.filter(item => item.status === "success").length,
        failedStep: step.name,
        steps,
        keys: {
          games: "mlb:games:today",
          odds: "mlb:odds:today",
          pitcherStats: "mlb:stats:pitchers",
          bullpenStats: "mlb:stats:bullpen",
          predictions: "mlb:predictions:today",
          edges: "mlb:edges:today"
        }
      })
    }
  }

  return res.status(200).json({
    ok: true,
    completedSteps: steps.length,
    steps,
    keys: {
      games: "mlb:games:today",
      odds: "mlb:odds:today",
      pitcherStats: "mlb:stats:pitchers",
      bullpenStats: "mlb:stats:bullpen",
      predictions: "mlb:predictions:today",
      edges: "mlb:edges:today"
    }
  })
}
