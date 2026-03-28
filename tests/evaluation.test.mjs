import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluatePredictions,
  expandDateRangeInclusive,
  inferPredictedWinner,
  inferWinnerFromFinalScore,
} from '../lib/evaluation.js'

test('expandDateRangeInclusive returns every day including endpoints', () => {
  assert.deepEqual(
    expandDateRangeInclusive('2026-03-01', '2026-03-03'),
    ['2026-03-01', '2026-03-02', '2026-03-03']
  )
})

test('expandDateRangeInclusive rejects invalid ranges and malformed dates', () => {
  assert.throws(
    () => expandDateRangeInclusive('2026-02-30', '2026-03-01'),
    /valid YYYY-MM-DD/
  )

  assert.throws(
    () => expandDateRangeInclusive('2026-03-02', '2026-03-01'),
    /less than or equal/
  )
})

test('inferPredictedWinner enforces valid probabilities and no ties', () => {
  assert.deepEqual(inferPredictedWinner(0.63, 0.37), { winner: 'home' })
  assert.deepEqual(inferPredictedWinner(0.45, 0.55), { winner: 'away' })
  assert.deepEqual(
    inferPredictedWinner(0.5, 0.5),
    { winner: null, reason: 'predictionProbabilityTie' }
  )
  assert.deepEqual(
    inferPredictedWinner(-0.1, 1.1),
    { winner: null, reason: 'invalidPredictionProbabilities' }
  )
})

test('inferWinnerFromFinalScore infers winner and rejects invalid final rows', () => {
  assert.deepEqual(inferWinnerFromFinalScore(7, 2), { winner: 'home' })
  assert.deepEqual(inferWinnerFromFinalScore(1, 8), { winner: 'away' })
  assert.deepEqual(
    inferWinnerFromFinalScore(4, 4),
    { winner: null, reason: 'finalScoreTie' }
  )
  assert.deepEqual(
    inferWinnerFromFinalScore(-1, 5),
    { winner: null, reason: 'invalidFinalScore' }
  )
})

test('evaluatePredictions computes metrics and brier score for matched games', () => {
  const predictions = [
    { matchKey: 'a', homeWinProbability: 0.8, awayWinProbability: 0.2 },
    { matchKey: 'b', homeWinProbability: 0.3, awayWinProbability: 0.7 },
    { matchKey: 'c', homeWinProbability: 0.6, awayWinProbability: 0.4 },
  ]

  const finalResults = [
    { matchKey: 'a', homeScore: 5, awayScore: 1 },
    { matchKey: 'b', homeScore: 6, awayScore: 2 },
  ]

  const { metrics, matchedRecords, unmatchedRecords } = evaluatePredictions(predictions, finalResults)

  assert.equal(metrics.gamesPredicted, 3)
  assert.equal(metrics.gamesMatchedToFinal, 2)
  assert.equal(metrics.coverageRate, 2 / 3)
  assert.equal(metrics.accuracy, 1 / 2)

  const expectedBrier = ((1 - 0.8) ** 2 + (1 - 0.3) ** 2) / 2
  assert.equal(metrics.brierScore, expectedBrier)

  assert.equal(matchedRecords.length, 2)
  assert.equal(
    unmatchedRecords.filter((entry) => entry.reason === 'missingFinalResult').length,
    1
  )
})

test('evaluatePredictions marks invalid rows and unmatched finals explicitly', () => {
  const predictions = [
    { matchKey: 'm1', homeWinProbability: 0.55, awayWinProbability: 0.45 },
    { matchKey: null, homeWinProbability: 0.55, awayWinProbability: 0.45 },
    { matchKey: 'm2', homeWinProbability: 0.5, awayWinProbability: 0.5 },
  ]

  const finalResults = [
    { matchKey: 'm1', homeScore: 3, awayScore: 2 },
    { matchKey: 'm3', homeScore: 1, awayScore: 0 },
    { matchKey: 'm1', homeScore: 4, awayScore: 2 },
    { matchKey: null, homeScore: 1, awayScore: 0 },
  ]

  const output = evaluatePredictions(predictions, finalResults)

  assert.equal(output.metrics.gamesPredicted, 1)
  assert.equal(output.metrics.gamesMatchedToFinal, 1)
  assert.equal(output.metrics.coverageRate, 1)
  assert.equal(output.metrics.accuracy, 1)
  assert.equal(output.metrics.brierScore, (1 - 0.55) ** 2)

  assert.ok(output.unmatchedRecords.some((entry) => entry.reason === 'missingMatchKey' && entry.type === 'prediction'))
  assert.ok(output.unmatchedRecords.some((entry) => entry.reason === 'predictionProbabilityTie'))
  assert.ok(output.unmatchedRecords.some((entry) => entry.reason === 'duplicateFinalResult'))
  assert.ok(output.unmatchedRecords.some((entry) => entry.reason === 'missingMatchKey' && entry.type === 'result'))
  assert.ok(output.unmatchedRecords.some((entry) => entry.reason === 'noPredictionForFinal' && entry.matchKey === 'm3'))
})
