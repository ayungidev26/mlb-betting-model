import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    // Check if odds already exist in Redis
    const existingOdds = await redis.get("mlb_odds_today")

    if (existingOdds) {
      return res.status(200).json({
        source: "redis-cache",
        gamesFound: existingOdds.length,
        odds: existingOdds
      })
    }

    // If no cached odds, call The Odds API
    const apiKey = process.env.ODDS_API_KEY

    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`

    const response = await fetch(url)

    const data = await response.json()

    const odds = data.map(game => {

      const homeTeam = game.home_team
      const awayTeam = game.away_team
      const gameDate = game.commence_time

      const sportsbooks = game.bookmakers.map(book => {

        const market = book.markets.find(m => m.key === "h2h")

        if (!market) return null

        const outcomes = market.outcomes

        const homeOdds =
          outcomes.find(o => o.name === homeTeam)?.price

        const awayOdds =
          outcomes.find(o => o.name === awayTeam)?.price

        return {
          sportsbook: book.key,
          lastUpdated: book.last_update,
          market: market.key,
          homeOdds,
          awayOdds
        }

      }).filter(Boolean)

      return {
        gameDate,
        homeTeam,
        awayTeam,
        sportsbooks
      }

    })

    // Store odds in Redis
    await redis.set("mlb_odds_today", odds)

    res.status(200).json({
      source: "odds-api",
      gamesFound: odds.length,
      odds
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
