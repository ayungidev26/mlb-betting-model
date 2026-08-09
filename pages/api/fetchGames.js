// Data contract reference: see docs/data-contracts.md for canonical Game, OddsRecord, Prediction, Edge, and matchKey shapes.
import { redis } from "../../lib/upstash.js"
import { buildMatchKey } from "../../lib/matchKey.js"
import { validateExternalMlbSchedulePayload } from "../../lib/payloadValidation.js"
import { requireOperationalRouteAccess } from "../../lib/apiSecurity.js"
import { sendRouteError } from "../../lib/apiErrors.js"
import { fetchJsonWithRetry } from "../../lib/upstreamFetch.js"
import { getBallparkFactorIndex, resolveBallparkFactors } from "../../lib/ballparkFactors.js"
import { getEasternDateKey } from "../../lib/cronSchedule.js"
import { classifyMlbGameType, isEligibleMlbGame } from "../../lib/mlbGameEligibility.js"
import { buildMlbScheduleUrl } from "../../lib/mlbSchedule.js"

export default async function handler(req, res) {
  if (!requireOperationalRouteAccess(req, res)) {
    return
  }

  try {
    const ballparkFactorIndex = await getBallparkFactorIndex()

    const dateKey = getEasternDateKey()

    const url = buildMlbScheduleUrl(dateKey)

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

    const skippedByReason = {}
    const eligibleGames = data.dates
      .flatMap((dateEntry) => dateEntry.games)
      .filter((game) => {
        const eligibility = isEligibleMlbGame(game)
        if (!eligibility.eligible) {
          skippedByReason[eligibility.reason] = (skippedByReason[eligibility.reason] || 0) + 1
        }
        return eligibility.eligible
      })

    const games = await Promise.all(eligibleGames.map(async (game) => {
      const seasonType = classifyMlbGameType(game.gameType)

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
        statusCode: game.status.codedGameState || null,
        seasonType
      }

    }))

    await redis.set("mlb:games:today", games)
    await redis.set("mlb:games:today:meta", {
      fetchedAt: new Date().toISOString(),
      dateKey,
      gamesToday: games.length,
      gamesFetched: data.dates.flatMap((entry) => entry.games).length,
      skippedByReason
    })
    await redis.set("mlb:ballparkFactors:current", {
      source: ballparkFactorIndex.source,
      ballparks: ballparkFactorIndex.records
    })

    console.info("[fetchGames] cached today's games", {
      dateKey,
      gamesToday: games.length,
      skippedByReason
    })

    res.status(200).json({
      gamesToday: games.length,
      sample: games.slice(0,3)
    })

  } catch (error) {
    return sendRouteError(res, "fetchGames", error)
  }

}
