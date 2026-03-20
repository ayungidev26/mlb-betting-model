// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { calculateElo } from "../../model/eloRatings"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity"
import { sendRouteError } from "../../lib/apiErrors"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {

    const seasons = [
      2015,2016,2017,2018,2019,
      2020,2021,2022,2023,2024,2025
    ]

    let allGames = []

    for (const season of seasons) {

      const seasonGames =
        await redis.get(`mlb:games:historical:${season}`)

      if (seasonGames && seasonGames.length > 0) {
        allGames = allGames.concat(seasonGames)
      }

    }

    if (allGames.length === 0) {
      return res.status(400).json({
        error: "Historical data unavailable",
        code: "HISTORICAL_DATA_UNAVAILABLE"
      })
    }

    // Run ELO rating calculation
    const ratings = calculateElo(allGames)

    // Store ratings
    await redis.set("mlb:ratings:teams", ratings)

    res.status(200).json({
      seasonsUsed: seasons.length,
      gamesProcessed: allGames.length,
      teamsRated: Object.keys(ratings).length,
      sampleRatings: Object.entries(ratings).slice(0,5)
    })

  } catch (error) {
    return sendRouteError(res, "buildRatings", error)
  }

}
