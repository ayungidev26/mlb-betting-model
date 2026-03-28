function parseIsoDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const normalized = date.toISOString().slice(0, 10)

  if (normalized !== value) {
    return null
  }

  return date
}

/**
 * Expand a YYYY-MM-DD date range (inclusive) into daily ISO dates.
 *
 * Usage:
 *   expandDateRangeInclusive('2026-04-01', '2026-04-03')
 *   // => ['2026-04-01', '2026-04-02', '2026-04-03']
 */
export function expandDateRangeInclusive(startDate, endDate) {
  const start = parseIsoDateOnly(startDate)
  const end = parseIsoDateOnly(endDate)

  if (!start || !end) {
    throw new Error('startDate and endDate must be valid YYYY-MM-DD strings')
  }

  if (start.getTime() > end.getTime()) {
    throw new Error('startDate must be less than or equal to endDate')
  }

  const output = []
  const cursor = new Date(start)

  while (cursor.getTime() <= end.getTime()) {
    output.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return output
}

export function inferPredictedWinner(homeWinProbability, awayWinProbability) {
  if (!Number.isFinite(homeWinProbability) || !Number.isFinite(awayWinProbability)) {
    return { winner: null, reason: 'invalidPredictionProbabilities' }
  }

  if (homeWinProbability < 0 || homeWinProbability > 1 || awayWinProbability < 0 || awayWinProbability > 1) {
    return { winner: null, reason: 'invalidPredictionProbabilities' }
  }

  if (homeWinProbability === awayWinProbability) {
    return { winner: null, reason: 'predictionProbabilityTie' }
  }

  if (homeWinProbability > awayWinProbability) {
    return { winner: 'home' }
  }

  return { winner: 'away' }
}

export function inferWinnerFromFinalScore(homeScore, awayScore) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { winner: null, reason: 'invalidFinalScore' }
  }

  if (homeScore < 0 || awayScore < 0) {
    return { winner: null, reason: 'invalidFinalScore' }
  }

  if (homeScore === awayScore) {
    return { winner: null, reason: 'finalScoreTie' }
  }

  if (homeScore > awayScore) {
    return { winner: 'home' }
  }

  return { winner: 'away' }
}

function summarizeMetrics(gamesPredicted, gamesMatchedToFinal, correctPredictions, brierAccumulator) {
  const coverageRate = gamesPredicted === 0 ? 0 : gamesMatchedToFinal / gamesPredicted
  const accuracy = gamesMatchedToFinal === 0 ? 0 : correctPredictions / gamesMatchedToFinal
  const brierScore = gamesMatchedToFinal === 0 ? 0 : brierAccumulator / gamesMatchedToFinal

  return {
    gamesPredicted,
    gamesMatchedToFinal,
    coverageRate,
    accuracy,
    brierScore,
  }
}

/**
 * Join model predictions to final results by matchKey and compute evaluation metrics.
 *
 * Prediction row fields expected by default:
 *   { matchKey, homeWinProbability, awayWinProbability }
 *
 * Final row fields expected by default:
 *   { matchKey, homeScore, awayScore }
 */
export function evaluatePredictions(predictions = [], finalResults = [], options = {}) {
  const {
    predictionMatchKeyField = 'matchKey',
    resultMatchKeyField = 'matchKey',
    homeProbabilityField = 'homeWinProbability',
    awayProbabilityField = 'awayWinProbability',
    homeScoreField = 'homeScore',
    awayScoreField = 'awayScore',
  } = options

  const unmatchedRecords = []
  const matchedRecords = []

  const resultByMatchKey = new Map()
  const resultCounts = new Map()

  for (const result of finalResults) {
    const matchKey = result?.[resultMatchKeyField]

    if (!matchKey) {
      unmatchedRecords.push({ type: 'result', reason: 'missingMatchKey', record: result })
      continue
    }

    const currentCount = (resultCounts.get(matchKey) ?? 0) + 1
    resultCounts.set(matchKey, currentCount)

    if (currentCount === 1) {
      resultByMatchKey.set(matchKey, result)
      continue
    }

    unmatchedRecords.push({ type: 'result', reason: 'duplicateFinalResult', record: result, matchKey })
  }

  const usedResultKeys = new Set()

  let gamesPredicted = 0
  let gamesMatchedToFinal = 0
  let correctPredictions = 0
  let brierAccumulator = 0

  for (const prediction of predictions) {
    const matchKey = prediction?.[predictionMatchKeyField]

    if (!matchKey) {
      unmatchedRecords.push({ type: 'prediction', reason: 'missingMatchKey', record: prediction })
      continue
    }

    const predictedOutcome = inferPredictedWinner(
      prediction?.[homeProbabilityField],
      prediction?.[awayProbabilityField]
    )

    if (!predictedOutcome.winner) {
      unmatchedRecords.push({ type: 'prediction', reason: predictedOutcome.reason, record: prediction, matchKey })
      continue
    }

    gamesPredicted += 1

    const result = resultByMatchKey.get(matchKey)

    if (!result) {
      unmatchedRecords.push({ type: 'prediction', reason: 'missingFinalResult', record: prediction, matchKey })
      continue
    }

    const actualOutcome = inferWinnerFromFinalScore(result?.[homeScoreField], result?.[awayScoreField])

    if (!actualOutcome.winner) {
      unmatchedRecords.push({ type: 'result', reason: actualOutcome.reason, record: result, matchKey })
      continue
    }

    usedResultKeys.add(matchKey)
    gamesMatchedToFinal += 1

    const correct = predictedOutcome.winner === actualOutcome.winner
    if (correct) {
      correctPredictions += 1
    }

    const probabilityOfActualWinner = actualOutcome.winner === 'home'
      ? prediction?.[homeProbabilityField]
      : prediction?.[awayProbabilityField]

    const brierComponent = (1 - probabilityOfActualWinner) ** 2
    brierAccumulator += brierComponent

    matchedRecords.push({
      matchKey,
      prediction,
      result,
      predictedWinner: predictedOutcome.winner,
      actualWinner: actualOutcome.winner,
      correct,
      brierComponent,
    })
  }

  for (const [matchKey, result] of resultByMatchKey.entries()) {
    if (usedResultKeys.has(matchKey)) {
      continue
    }

    unmatchedRecords.push({ type: 'result', reason: 'noPredictionForFinal', record: result, matchKey })
  }

  return {
    metrics: summarizeMetrics(
      gamesPredicted,
      gamesMatchedToFinal,
      correctPredictions,
      brierAccumulator
    ),
    matchedRecords,
    unmatchedRecords,
  }
}
