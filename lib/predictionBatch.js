import { validateCanonicalPrediction } from "./payloadValidation.js"

export async function buildPredictionBatch(games, inputs, predictionFn) {
  const predictions = []
  const failures = []
  for (const game of games) {
    try {
      const prediction = await predictionFn(game, inputs.teamRatings, inputs.bullpenStats, inputs.pitcherStats, inputs.offenseStats)
      if (!prediction) throw new Error("prediction returned no result")
      const canonical = { ...prediction, gameId: game.gameId, matchKey: game.matchKey }
      validateCanonicalPrediction(canonical)
      predictions.push(canonical)
    } catch (error) {
      failures.push({ gameId: game.gameId, matchKey: game.matchKey, code: "PREDICTION_FAILED", message: error?.name === "ValidationError" ? "prediction validation failed" : "prediction calculation failed" })
    }
  }
  return { predictions, failures, eligibleGames: games.length, predictionsSucceeded: predictions.length, predictionsFailed: failures.length, failedGameIds: failures.map(failure => failure.gameId), coverage: games.length ? predictions.length / games.length : 1 }
}
