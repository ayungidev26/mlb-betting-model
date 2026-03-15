import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const today = new Date().toISOString().split("T")[0]

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

    const odds = data.map(game => {

      const sportsbooks = game.bookmakers.map(book => {

        const market = book.markets.find(m => m.key === "h2h")

        const home = market.outcomes.find(o => o.name === game.home_team)
        const away = market.outcomes.find(o => o.name === game.away_team)

        return {
          sportsbook: book.key,
          lastUpdated: book.last_update,
          homeOdds: home.price,
          awayOdds: away.price
        }

      })

      return {
        gameId: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        sportsbooks: sportsbooks
      }

    })

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
