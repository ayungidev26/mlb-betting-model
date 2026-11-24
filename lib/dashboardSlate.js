import { getEasternDateKey } from "./cronSchedule.js"
import { buildMlbGameIdentity, getEasternDate } from "./gameIdentity.js"
import { buildHomePageProps } from "./homePageProps.js"
import { loadEmptySlate } from "./offseason.js"
import { buildMlbScheduleUrl } from "./mlbSchedule.js"
import { fetchJsonWithRetry } from "./upstreamFetch.js"

async function confirmsNoScheduledGames(dateKey, fetchImpl) {
  try {
    const schedule = await fetchJsonWithRetry(buildMlbScheduleUrl(dateKey), {
      fetchImpl, timeoutMs: 2500, retries: 0
    })
    return schedule?.totalGames === 0 && Array.isArray(schedule.dates)
      && schedule.dates.every((entry) => entry?.date === dateKey
        && Array.isArray(entry.games) && entry.games.length === 0)
  } catch {
    return false
  }
}

const unavailableSlate = { status: "unavailable" }

export async function loadDashboardSlate(redisClient, dateKey = getEasternDateKey(), fetchImpl = fetch) {
  let slate = unavailableSlate
  const { props } = await buildHomePageProps(async () => {
    const [schedule, metadata] = await Promise.all([
      redisClient.get("mlb:games:today"),
      redisClient.get("mlb:games:today:meta")
    ]).catch(() => [])
    if (metadata?.dateKey !== dateKey || !Array.isArray(schedule) || schedule.length !== metadata.gamesToday) {
      if (await confirmsNoScheduledGames(dateKey, fetchImpl)) {
        slate = await loadEmptySlate(redisClient, dateKey, fetchImpl)
      }
      return { predictions: [] }
    }

    const gameId = (game) => String(game?.gamePk ?? game?.gameId ?? "")
    const scheduledGames = new Map(schedule.map((game) => [gameId(game), game]))
    if (scheduledGames.size !== schedule.length || scheduledGames.has("")
        || schedule.some((game) => getEasternDate(game.date) !== dateKey)) {
      return { predictions: [] }
    }

    if (schedule.length === 0) {
      slate = await loadEmptySlate(redisClient, dateKey, fetchImpl)
      if (slate.status === "empty" && Object.keys(metadata.skippedByReason || {}).length > 0) {
        slate = { status: "ineligible" }
      }
      return { predictions: [] }
    }

    slate = { status: "scheduled" }
    const [predictions, predictionMetadata, edges, edgeMetadata, odds, oddsMetadata] = await Promise.all([
      redisClient.get("mlb:predictions:today"),
      redisClient.get("mlb:predictions:today:meta"),
      redisClient.get("mlb:edges:today"),
      redisClient.get("mlb:edges:today:meta"),
      redisClient.get("mlb:odds:today"),
      redisClient.get("mlb:odds:today:meta")
    ])

    const matchingPredictions = (Array.isArray(predictions) ? predictions : []).filter(
      (prediction) => scheduledGames.has(gameId(prediction)) && getEasternDate(prediction.date) === dateKey
    ).map((prediction) => {
      const game = scheduledGames.get(gameId(prediction))
      return {
        ...prediction,
        matchKey: game.matchKey ?? buildMlbGameIdentity(gameId(game)),
        lifecycle: game.lifecycle ?? prediction.lifecycle ?? "upcoming",
        status: game.status ?? prediction.status ?? null,
        statusCode: game.statusCode ?? prediction.statusCode ?? null
      }
    })

    return {
      predictions: matchingPredictions,
      predictionMetadata,
      edges: predictionMetadata && edgeMetadata ? edges : [],
      edgeMetadata,
      odds: predictionMetadata && oddsMetadata ? odds : [],
      oddsMetadata,
      expectedDateKey: dateKey
    }
  })

  return { ...props, slate, dateKey }
}
