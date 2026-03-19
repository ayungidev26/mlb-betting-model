// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash"
import { buildMatchKey } from "../../lib/matchKey"
import { validateExternalMlbSchedulePayload } from "../../lib/payloadValidation"

export default async function handler(req, res) {

  try {

    const today = new Date().toISOString().split("T")[0]

    const url =
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher`

    const response = await fetch(url)
    const data = await response.json()

    validateExternalMlbSchedulePayload(data)

    if (data.dates.length === 0) {

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

      const homeTeam = game.teams.home.team.name
      const awayTeam = game.teams.away.team.name

      return {
        gameId: game.gamePk,
        matchKey: buildMatchKey(game.gameDate, awayTeam, homeTeam),
        date: game.gameDate,
        homeTeam,
        awayTeam,

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
