import { findEdgesFromData } from "./findEdges.js"
import {
  validateCanonicalGame,
  validateCanonicalOddsRecord,
  validateCanonicalPrediction,
  validateRecordArray
} from "./payloadValidation.js"
import { buildMatchKey } from "./matchKey.js"
import { predictGame } from "../model/predictor.js"

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function normalizeStoredGame(game) {
  const repairedMatchKey =
    hasNonEmptyString(game?.matchKey)
      ? game.matchKey
      : buildMatchKey(game?.date, game?.awayTeam, game?.homeTeam)

  return {
    ...game,
    matchKey: repairedMatchKey
  }
}

export async function buildPredictionsFromData(
  games = [],
  teamRatings = {},
  bullpenStats = null,
  pitcherStatsOrPredictGameFn = null,
  predictGameFn = predictGame
) {
  const pitcherStats =
    typeof pitcherStatsOrPredictGameFn === "function"
      ? null
      : pitcherStatsOrPredictGameFn
  const predictionFn =
    typeof pitcherStatsOrPredictGameFn === "function"
      ? pitcherStatsOrPredictGameFn
      : predictGameFn

  validateRecordArray(games, validateCanonicalGame, "Games payload")

  const predictions = []

  for (const game of games) {
    const prediction = await predictionFn(
      game,
      teamRatings,
      bullpenStats,
      pitcherStats
    )

    if (!prediction) {
      continue
    }

    const canonicalPrediction = {
      ...prediction,
      matchKey: game.matchKey || prediction.matchKey || null
    }

    validateCanonicalPrediction(canonicalPrediction)
    predictions.push(canonicalPrediction)
  }

  return predictions
}

export async function generatePredictions(redisClient, predictGameFn = predictGame) {
  const storedGames = await redisClient.get("mlb:games:today")

  if (!storedGames || storedGames.length === 0) {
    return {
      predictions: [],
      message: "No games today"
    }
  }

  const games = storedGames.map(normalizeStoredGame)

  validateRecordArray(games, validateCanonicalGame, "Games payload")

  const repairedGames =
    games.some((game, index) => game.matchKey !== storedGames[index]?.matchKey)

  if (repairedGames) {
    await redisClient.set("mlb:games:today", games)
  }

  const teamRatings = await redisClient.get("mlb:ratings:teams")

  if (!teamRatings) {
    throw new Error("Team ratings not found")
  }

  const bullpenStats = await redisClient.get("mlb:stats:bullpen")
  const pitcherStats = await redisClient.get("mlb:stats:pitchers")
  const predictions = await buildPredictionsFromData(
    games,
    teamRatings,
    bullpenStats,
    pitcherStats,
    predictGameFn
  )

  await redisClient.set("mlb:predictions:today", predictions)

  const today = new Date().toISOString().split("T")[0]

  await redisClient.set(`mlb:predictions:${today}`, predictions)

  return {
    predictions,
    predictionsCreated: predictions.length,
    sample: predictions.slice(0, 3)
  }
}

export async function generateEdges(redisClient, edgeThreshold) {
  const predictions = await redisClient.get("mlb:predictions:today")
  const odds = await redisClient.get("mlb:odds:today")

  if (!predictions || !odds) {
    throw new Error("Missing predictions or odds data")
  }

  validateRecordArray(
    predictions,
    validateCanonicalPrediction,
    "Predictions payload"
  )
  validateRecordArray(odds, validateCanonicalOddsRecord, "Odds payload")

  const result = findEdgesFromData(predictions, odds, edgeThreshold)

  await redisClient.set("mlb:edges:today", result.edges)

  return result
}
