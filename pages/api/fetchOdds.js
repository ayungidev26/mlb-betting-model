// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { normalizeOddsPayload } from "../../lib/normalizeOdds"

export default async function handler(req, res) {

  try {


    // Prevent unnecessary API calls unless refresh requested
    const refresh = req.query.refresh === "true"

    if (!refresh) {
      const existing = await redis.get("mlb:odds:today")

      if (existing) {
        return res.status(200).json({
          source: "cache",
          games: existing.length,
          odds: existing.slice(0,3)
        })
      }
    }

    const apiKey = process.env.ODDS_API_KEY

    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`

    const response = await fetch(url)
    const data = await response.json()

    if (!Array.isArray(data)) {
      throw new Error(data?.message || "Unexpected odds API response")
    }

    const odds = normalizeOddsPayload(data)

    await redis.set("mlb:odds:today", odds)

    res.status(200).json({
      source: "api",
      games: odds.length,
      oddsSample: odds.slice(0,3)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
