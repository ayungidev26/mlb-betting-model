import { getEasternDateKey } from "./cronSchedule.js"
import { buildMlbGameIdentity, getEasternDate } from "./gameIdentity.js"
import { buildHomePageProps } from "./homePageProps.js"
import { loadEmptySlate } from "./offseason.js"

const unavailableSlate = { status: "unavailable" }

export async function loadDashboardSlate(redisClient, dateKey = getEasternDateKey(), fetchImpl = fetch) {
  let slate = unavailableSlate
  const { props } = await buildHomePageProps(async () => {
    const [schedule, metadata] = await Promise.all([
      redisClient.get("mlb:games:today"),
      redisClient.get("mlb:games:today:meta")
    ]).catch(() => [])
    if (metadata?.dateKey !== dateKey || !Array.isArray(schedule) || schedule.length !== metadata.gamesToday) {
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
