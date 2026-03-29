// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { buildMatchKey } from "../../lib/matchKey.js"
import { validateExternalMlbSchedulePayload } from "../../lib/payloadValidation.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
import { getBallparkFactorIndex, resolveBallparkFactors } from "../../lib/ballparkFactors.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {
    const ballparkFactorIndex = await getBallparkFactorIndex()

    const today = new Date().toISOString().split("T")[0]
    const dateKey = getEasternDateKey()

    const url =
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher`

    const data = await fetchJsonWithRetry(url)

    validateExternalMlbSchedulePayload(data)

    if (data.dates.length === 0) {

      await redis.set("mlb:games:today", [])
      await redis.set("mlb:games:today:meta", {
        fetchedAt: new Date().toISOString(),
        dateKey,
        gamesToday: 0
      })

      console.info("[fetchGames] cached today's games", {
        dateKey,
        gamesToday: 0
      })

      return res.status(200).json({
        gamesToday: 0,
        games: []
      })

    }

    const games = await Promise.all(data.dates[0].games.map(async (game) => {

      let seasonType = "regular"

      if (game.gameType === "S") {
        seasonType = "spring"
      }

      if (["P","F","D","L","W"].includes(game.gameType)) {
        seasonType = "playoffs"
      }

      const homeTeam = game.teams.home.team.name
      const awayTeam = game.teams.away.team.name
      const venue = game.venue?.name || null
      const ballpark = await resolveBallparkFactors({
        venue,
        homeTeam
      }, ballparkFactorIndex)

      return {
        gameId: game.gamePk,
        matchKey: buildMatchKey(game.gameDate, awayTeam, homeTeam),
        date: game.gameDate,
        homeTeam,
        awayTeam,

        homePitcher: game.teams.home.probablePitcher?.fullName || null,
        homePitcherId: game.teams.home.probablePitcher?.id || null,
        awayPitcher: game.teams.away.probablePitcher?.fullName || null,
        awayPitcherId: game.teams.away.probablePitcher?.id || null,

        venue,
        venueId: game.venue?.id ?? null,
        ballpark,
        status: game.status.detailedState,
        seasonType
      }

    }))

    await redis.set("mlb:games:today", games)
    await redis.set("mlb:games:today:meta", {
      fetchedAt: new Date().toISOString(),
      dateKey,
      gamesToday: games.length
    })
    await redis.set("mlb:ballparkFactors:current", {
      source: ballparkFactorIndex.source,
      ballparks: ballparkFactorIndex.records
    })

    console.info("[fetchGames] cached today's games", {
      dateKey,
      gamesToday: games.length
    })

    res.status(200).json({
      gamesToday: games.length,
      sample: games.slice(0,3)
    })

  } catch (error) {
    return sendRouteError(res, "fetchGames", error)
  }

}
