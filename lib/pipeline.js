import { findEdgesFromData } from "./findEdges.js"
import {
  validateCanonicalGame,
  validateCanonicalOddsRecord,
  validateCanonicalPrediction,
  validateRecordArray
} from "./payloadValidation.js"
import { predictGame } from "../model/predictor.js"

export async function buildPredictionsFromData(
  games = [],
  teamRatings = {},
  bullpenStats = null,
  predictGameFn = predictGame
) {
  validateRecordArray(games, validateCanonicalGame, "Games payload")

  const predictions = []

  for (const game of games) {
    const prediction = await predictGameFn(game, teamRatings, bullpenStats)

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
  const games = await redisClient.get("mlb:games:today")

  if (!games || games.length === 0) {
    return {
      predictions: [],
      message: "No games today"
    }
  }

  const teamRatings = await redisClient.get("mlb:ratings:teams")

  if (!teamRatings) {
    throw new Error("Team ratings not found")
  }

  const bullpenStats = await redisClient.get("mlb:stats:bullpen")
  const predictions = await buildPredictionsFromData(
    games,
    teamRatings,
    bullpenStats,
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
