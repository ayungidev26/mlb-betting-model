import { findEdgesFromData } from "./findEdges.js"
import {
  validateCanonicalGame,
  validateCanonicalOddsRecord,
  validateCanonicalPrediction,
  validateRecordArray
} from "./payloadValidation.js"
import { buildMatchKey } from "./matchKey.js"
import { getEasternDateKey } from "./cronSchedule.js"
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
  offenseStatsOrPredictGameFn = null,
  predictGameFn = predictGame
) {
  let pitcherStats = null
  let offenseStats = null
  let predictionFn = predictGameFn

  if (typeof pitcherStatsOrPredictGameFn === "function") {
    predictionFn = pitcherStatsOrPredictGameFn
  } else {
    pitcherStats = pitcherStatsOrPredictGameFn

    if (typeof offenseStatsOrPredictGameFn === "function") {
      predictionFn = offenseStatsOrPredictGameFn
    } else {
      offenseStats = offenseStatsOrPredictGameFn
    }
  }

  validateRecordArray(games, validateCanonicalGame, "Games payload")

  const predictions = []

  for (const game of games) {
    const prediction = await predictionFn(
      game,
      teamRatings,
      bullpenStats,
      pitcherStats,
      offenseStats
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
  const [storedGames, storedGamesMeta] = await Promise.all([
    redisClient.get("mlb:games:today"),
    redisClient.get("mlb:games:today:meta")
  ])

  if (!Array.isArray(storedGames)) {
    throw new Error(
      "Games cache missing (mlb:games:today). Run /api/runStatsPipeline first."
    )
  }

  const todayDateKey = getEasternDateKey()
  const staleGamesCache =
    Boolean(storedGamesMeta?.dateKey) && storedGamesMeta.dateKey !== todayDateKey

  if (staleGamesCache) {
    throw new Error(
      `Games cache stale (mlb:games:today:meta dateKey=${storedGamesMeta.dateKey}, expected=${todayDateKey}). Run /api/runStatsPipeline first.`
    )
  }

  if (storedGames.length === 0) {
    await redisClient.set("mlb:predictions:today", [])
    await redisClient.set(`mlb:predictions:${todayDateKey}`, [])
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

  const [bullpenStats, pitcherStats, offenseStats, bullpenMeta, pitcherMeta, offenseMeta] =
    await Promise.all([
      redisClient.get("mlb:stats:bullpen"),
      redisClient.get("mlb:stats:pitchers"),
      redisClient.get("mlb:stats:offense"),
      redisClient.get("mlb:stats:bullpen:meta"),
      redisClient.get("mlb:stats:pitchers:meta"),
      redisClient.get("mlb:stats:offense:meta")
    ])
  const missingStats = []

  if (!pitcherStats) {
    missingStats.push("mlb:stats:pitchers")
  }

  if (!bullpenStats) {
    missingStats.push("mlb:stats:bullpen")
  }

  if (!offenseStats) {
    missingStats.push("mlb:stats:offense")
  }

  if (missingStats.length > 0) {
    throw new Error(
      `Stats cache missing (${missingStats.join(", ")}). Run /api/runStatsPipeline first.`
    )
  }

  const staleStats = [
    ["mlb:stats:pitchers:meta", pitcherMeta],
    ["mlb:stats:bullpen:meta", bullpenMeta],
    ["mlb:stats:offense:meta", offenseMeta]
  ].filter(([, meta]) => meta?.dateKey && meta.dateKey !== todayDateKey)

  if (staleStats.length > 0) {
    throw new Error(
      `Stats cache stale or missing freshness metadata (${staleStats.map(([key]) => key).join(", ")}). Run /api/runStatsPipeline first.`
    )
  }

  const predictions = await buildPredictionsFromData(
    games,
    teamRatings,
    bullpenStats,
    pitcherStats,
    offenseStats,
    predictGameFn
  )

  await redisClient.set("mlb:predictions:today", predictions)

  await redisClient.set(`mlb:predictions:${todayDateKey}`, predictions)

  return {
    predictions,
    predictionsCreated: predictions.length,
    sample: predictions.slice(0, 3)
  }
}

export async function generateEdges(redisClient, edgeThreshold) {
  const [predictions, odds, oddsMeta] = await Promise.all([
    redisClient.get("mlb:predictions:today"),
    redisClient.get("mlb:odds:today"),
    redisClient.get("mlb:odds:today:meta")
  ])

  if (!predictions || !odds) {
    throw new Error("Missing predictions or odds data")
  }

  validateRecordArray(
    predictions,
    validateCanonicalPrediction,
    "Predictions payload"
  )
  validateRecordArray(odds, validateCanonicalOddsRecord, "Odds payload")

  const todayDateKey = getEasternDateKey()
  if (oddsMeta?.dateKey && oddsMeta.dateKey !== todayDateKey) {
    throw new Error(
      `Odds cache stale (dateKey=${oddsMeta.dateKey}, expected=${todayDateKey}). Refresh odds first.`
    )
  }

  const result = findEdgesFromData(predictions, odds, edgeThreshold)

  await redisClient.set("mlb:edges:today", result.edges)

  return result
}
