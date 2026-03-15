import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const refresh = req.query.refresh === "true"

    // Check Redis cache unless refresh requested
    if (!refresh) {
      const cachedOdds = await redis.get("mlb_odds_today")

      if (cachedOdds) {
        return res.status(200).json({
          source: "redis-cache",
          gamesFound: cachedOdds.length,
          odds: cachedOdds
        })
      }
    }

    const apiKey = process.env.ODDS_API_KEY

    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error("Odds API request failed")
    }

    const data = await response.json()

    const odds = data.map(game => {

      const homeTeam = game.home_team
      const awayTeam = game.away_team
      const gameDate = game.commence_time

      const sportsbooks = (game.bookmakers || []).map(book => {

        const market = (book.markets || []).find(
          m => m.key === "h2h"
        )

        if (!market) return null

        const outcomes = market.outcomes || []

        const homeOdds =
          outcomes.find(o => o.name === homeTeam)?.price

        const awayOdds =
          outcomes.find(o => o.name === awayTeam)?.price

        if (homeOdds == null || awayOdds == null) return null

        return {
          sportsbook: book.key,
          lastUpdated: book.last_update,
          market: market.key,
          homeOdds,
          awayOdds
        }

      }).filter(Boolean)

      if (sportsbooks.length === 0) return null

      return {
        gameDate,
        homeTeam,
        awayTeam,
        sportsbooks
      }

    }).filter(Boolean)

    // Store in Redis with expiration (24 hours)
    await redis.set("mlb_odds_today", odds, {
      ex: 86400
    })

    return res.status(200).json({
      source: "odds-api",
      gamesFound: odds.length,
      odds
    })

  } catch (error) {

    console.error(error)

    return res.status(500).json({
      error: error.message
    })

  }

}
