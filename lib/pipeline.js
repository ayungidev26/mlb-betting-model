import { findEdgesFromData, indexOddsByMatchKey } from "./findEdges.js"
import {
  validateCanonicalGame,
  validateCanonicalOddsRecord,
  validateCanonicalPrediction,
  validateRecordArray
} from "./payloadValidation.js"
import { buildMatchKey } from "./matchKey.js"
import { buildMlbGameIdentity } from "./gameIdentity.js"
import { getEasternDateKey } from "./cronSchedule.js"
import { predictGame } from "../model/predictor.js"
import { assertFreshTeamRatings, validateDatedCache } from "./cacheFreshness.js"
import { buildPredictionBatch } from "./predictionBatch.js"
import { classifyMlbGameLifecycle } from "./mlbGameEligibility.js"
export { buildPredictionBatch } from "./predictionBatch.js"

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function normalizeStoredGame(game) {
  const repairedMatchKey =
    hasNonEmptyString(game?.matchKey)
      ? game.matchKey
      : buildMlbGameIdentity(game?.gamePk) || buildMatchKey(game?.date, game?.awayTeam, game?.homeTeam)

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
  const [storedGames, storedGamesMeta, storedPredictions] = await Promise.all([
    redisClient.get("mlb:games:today"),
    redisClient.get("mlb:games:today:meta"),
    redisClient.get("mlb:predictions:today")
  ])

  if (!Array.isArray(storedGames)) {
    throw new Error(
      "Games cache missing (mlb:games:today). Run /api/runStatsPipeline first."
    )
  }

  const todayDateKey = getEasternDateKey()
  validateDatedCache({
    payload: storedGames,
    metadata: storedGamesMeta,
    expectedDateKey: todayDateKey,
    label: "Games"
  })

  if (storedGames.length === 0) {
    await redisClient.set("mlb:predictions:today", [])
    await redisClient.set("mlb:predictions:today:meta", {
      dateKey: todayDateKey,
      generatedAt: new Date().toISOString(),
      records: 0
    })
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

  const [teamRatings, teamRatingsMeta] = await Promise.all([
    redisClient.get("mlb:ratings:teams"),
    redisClient.get("mlb:ratings:teams:meta")
  ])

  if (!teamRatings) {
    throw new Error("Team ratings not found")
  }
  assertFreshTeamRatings(teamRatingsMeta)

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

  const datedStats = [
    ["mlb:stats:pitchers:meta", pitcherMeta],
    ["mlb:stats:bullpen:meta", bullpenMeta],
    ["mlb:stats:offense:meta", offenseMeta]
  ]
  for (const [key, meta] of datedStats) {
    validateDatedCache({ metadata: meta, expectedDateKey: todayDateKey, label: key })
  }

  const gamesWithLifecycle = games.map((game) => ({
    ...game,
    lifecycle: game.lifecycle || classifyMlbGameLifecycle(game)
  }))
  const completedGames = gamesWithLifecycle.filter((game) => game.lifecycle === "completed")
  const modelableGames = gamesWithLifecycle.filter((game) => game.lifecycle !== "completed")
  const cachedPredictionsByMatchKey = new Map(
    (Array.isArray(storedPredictions) ? storedPredictions : [])
      .filter((prediction) => prediction?.matchKey)
      .map((prediction) => [prediction.matchKey, prediction])
  )
  const preservedPredictions = completedGames.flatMap((game) => {
    const cachedPrediction = cachedPredictionsByMatchKey.get(game.matchKey)
    return cachedPrediction
      ? [{
          ...cachedPrediction,
          status: game.status || "Final",
          statusCode: game.statusCode || "F",
          lifecycle: "completed"
        }]
      : []
  })
  const batch = await buildPredictionBatch(modelableGames, { teamRatings, bullpenStats, pitcherStats, offenseStats }, predictGameFn)
  const generatedAt = new Date().toISOString()
  if (batch.predictionsFailed > 0) {
    await redisClient.set("mlb:predictions:today:refresh:meta", {
      dateKey: todayDateKey, generatedAt, status: "failed", ...batch, predictions: undefined, failures: batch.failures
    })
    const error = new Error(`Prediction batch rejected: ${batch.predictionsFailed} of ${batch.eligibleGames} eligible games failed`)
    error.code = "INCOMPLETE_PREDICTION_BATCH"
    error.diagnostics = { ...batch, predictions: undefined }
    throw error
  }
  const predictions = [...batch.predictions, ...preservedPredictions]

  await redisClient.set("mlb:predictions:today", predictions)
  await redisClient.set("mlb:predictions:today:meta", {
    dateKey: todayDateKey,
    generatedAt,
    records: predictions.length,
    eligibleGames: batch.eligibleGames,
    completedGames: completedGames.length,
    preservedCompletedPredictions: preservedPredictions.length,
    predictionsSucceeded: batch.predictionsSucceeded,
    predictionsFailed: 0,
    failedGameIds: [], coverage: batch.coverage, status: "healthy",
    sourceVersion: "prediction-batch-v2"
  })

  await redisClient.set(`mlb:predictions:${todayDateKey}`, predictions)

  return {
    predictions,
    predictionsCreated: predictions.length,
    sample: predictions.slice(0, 3)
  }
}

export async function generateEdges(redisClient, edgeThreshold) {
  const [predictions, predictionsMeta, odds, oddsMeta, storedEdges] = await Promise.all([
    redisClient.get("mlb:predictions:today"),
    redisClient.get("mlb:predictions:today:meta"),
    redisClient.get("mlb:odds:today"),
    redisClient.get("mlb:odds:today:meta"),
    redisClient.get("mlb:edges:today")
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
  validateDatedCache({ payload: predictions, metadata: predictionsMeta, expectedDateKey: todayDateKey, label: "Predictions" })
  validateDatedCache({ payload: odds, metadata: oddsMeta, expectedDateKey: todayDateKey, label: "Odds" })

  const predictionIds = new Set(predictions.map(item => item.matchKey))
  const duplicatePredictionIds = predictionIds.size !== predictions.length
  if (duplicatePredictionIds) {
    throw new Error("Predictions slate contains duplicate game identities")
  }

  // Odds providers can return more than one snapshot for the same game. This is
  // not an ambiguous game identity: indexOddsByMatchKey deterministically keeps
  // the most recently updated snapshot, matching the edge calculation's join
  // policy. Rejecting the entire slate here made otherwise valid scheduled runs
  // fail before findEdgesFromData could apply that policy.
  const uniqueOdds = Array.from(indexOddsByMatchKey(odds).values())

  const completedMatchKeys = new Set(
    predictions
      .filter((prediction) => prediction.lifecycle === "completed")
      .map((prediction) => prediction.matchKey)
  )
  const activePredictions = predictions.filter((prediction) => !completedMatchKeys.has(prediction.matchKey))
  const result = findEdgesFromData(activePredictions, uniqueOdds, edgeThreshold)
  const preservedCompletedEdges = (Array.isArray(storedEdges) ? storedEdges : [])
    .filter((edge) => completedMatchKeys.has(edge?.matchKey))
    .map((edge) => ({ ...edge, lifecycle: "completed", marketStatus: "historical" }))
  const edges = [...result.edges, ...preservedCompletedEdges]
  const generatedAt = new Date().toISOString()
  const meta = {
    dateKey: todayDateKey, generatedAt, eligibleGameCount: predictionsMeta?.eligibleGames ?? predictions.length,
    predictionCount: predictions.length, oddsCount: uniqueOdds.length,
    receivedOddsCount: odds.length, duplicateOddsCount: odds.length - uniqueOdds.length,
    edgeCount: edges.length,
    preservedCompletedEdges: preservedCompletedEdges.length,
    predictionGeneratedAt: predictionsMeta?.generatedAt || null,
    oddsGeneratedAt: oddsMeta?.generatedAt || oddsMeta?.fetchedAt || null,
    predictionSourceVersion: predictionsMeta?.sourceVersion || predictionsMeta?.version || "legacy",
    oddsSourceVersion: oddsMeta?.sourceVersion || oddsMeta?.version || "legacy",
    status: "healthy"
  }
  if (typeof redisClient.pipeline === "function") {
    await redisClient.pipeline().set("mlb:edges:today", edges).set("mlb:edges:today:meta", meta).exec()
  } else {
    await redisClient.set("mlb:edges:today", edges)
    await redisClient.set("mlb:edges:today:meta", meta)
  }

  return { ...result, edges, metadata: meta }
}
