import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const today = new Date().toISOString().split("T")[0]

    const url =
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher`

    const response = await fetch(url)
    const data = await response.json()

    if (!data.dates || data.dates.length === 0) {

      await redis.set("mlb:games:today", [])

      return res.status(200).json({
        gamesToday: 0,
        games: []
      })

    }

    const games = data.dates[0].games.map(game => {

      let seasonType = "regular"

      if (game.gameType === "S") {
        seasonType = "spring"
      }

      if (["P","F","D","L","W"].includes(game.gameType)) {
        seasonType = "playoffs"
      }

      return {
        gameId: game.gamePk,
        date: game.gameDate,
        homeTeam: game.teams.home.team.name,
        awayTeam: game.teams.away.team.name,

        homePitcher: game.teams.home.probablePitcher?.fullName || null,
        awayPitcher: game.teams.away.probablePitcher?.fullName || null,

        venue: game.venue?.name || null,
        status: game.status.detailedState,
        seasonType
      }

    })

    await redis.set("mlb:games:today", games)

    res.status(200).json({
      gamesToday: games.length,
      sample: games.slice(0,3)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
