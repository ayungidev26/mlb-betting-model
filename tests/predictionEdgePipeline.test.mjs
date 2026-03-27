import test from 'node:test'
import assert from 'node:assert/strict'

process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.test'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const { generateEdges, generatePredictions } = await import('../lib/pipeline.js')
import { ValidationError } from '../lib/payloadValidation.js'

function createMockRedis(seed = {}) {
  const store = new Map(Object.entries(seed))
  const getCounts = new Map()

  return {
    async get(key) {
      getCounts.set(key, (getCounts.get(key) || 0) + 1)
      return store.get(key)
    },
    async set(key, value) {
      store.set(key, value)
      return 'OK'
    },
    dump(key) {
      return store.get(key)
    },
    getCount(key) {
      return getCounts.get(key) || 0
    }
  }
}

test('prediction to edge pipeline stores predictions and edges from mocked Redis payloads', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homePitcher: null,
        awayPitcher: null,
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600
    },
    'mlb:stats:bullpen': {
      'Oakland Athletics': { era: 4.25, whip: 1.31 },
      'Los Angeles Dodgers': { era: 3.15, whip: 1.14 }
    },
    'mlb:stats:pitchers': {},
    'mlb:stats:offense': {
      'Oakland Athletics': { runsPerGame: 4.1, battingAverage: 0.239, onBasePercentage: 0.31, sluggingPercentage: 0.39, ops: 0.7, isolatedPower: 0.151, strikeoutRate: 0.23, walkRate: 0.082, weightedOnBaseAverage: 0.305, weightedRunsCreatedPlus: 93, splits: {} },
      'Los Angeles Dodgers': { runsPerGame: 5.4, battingAverage: 0.267, onBasePercentage: 0.342, sluggingPercentage: 0.455, ops: 0.797, isolatedPower: 0.188, strikeoutRate: 0.205, walkRate: 0.098, weightedOnBaseAverage: 0.344, weightedRunsCreatedPlus: 118, splits: {} }
    },
    'mlb:odds:today': [
      {
        gameId: 'odds-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        commenceTime: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homeMoneyline: 170,
        awayMoneyline: -185,
        sportsbook: 'draftkings',
        lastUpdated: '2025-04-10T18:00:00Z'
      }
    ]
  })

  const predictionResult = await generatePredictions(redis)
  assert.equal(predictionResult.predictionsCreated, 1)
  assert.equal(redis.dump('mlb:predictions:today').length, 1)

  const edgeResult = await generateEdges(redis)
  assert.equal(edgeResult.matchedGames, 1)
  assert.equal(edgeResult.unmatchedPredictions, 0)
  assert.equal(edgeResult.edges.length, 1)
  assert.equal(edgeResult.edges[0].team, 'Los Angeles Dodgers')
  assert.equal(redis.dump('mlb:edges:today').length, 1)
})

test('prediction pipeline repairs a missing matchKey when the cached game still has matchup fields', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600
    },
    'mlb:stats:pitchers': {},
    'mlb:stats:bullpen': {},
    'mlb:stats:offense': {}
  })

  const result = await generatePredictions(redis)

  assert.equal(result.predictionsCreated, 1)
  assert.equal(
    redis.dump('mlb:games:today')[0].matchKey,
    '2025-04-10|Los Angeles Dodgers|Oakland Athletics'
  )
})

test('prediction pipeline only fetches pitcher stats once for multiple games in the same run', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homePitcher: 'Pitcher A',
        awayPitcher: 'Pitcher B',
        seasonType: 'regular'
      },
      {
        gameId: 'game-2',
        matchKey: '2025-04-10|Seattle Mariners|Houston Astros',
        date: '2025-04-11T00:10:00Z',
        homeTeam: 'Houston Astros',
        awayTeam: 'Seattle Mariners',
        homePitcher: 'Pitcher C',
        awayPitcher: 'Pitcher D',
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600,
      'Houston Astros': 1540,
      'Seattle Mariners': 1520
    },
    'mlb:stats:bullpen': {},
    'mlb:stats:offense': {},
    'mlb:stats:pitchers': {
      'Pitcher A': { era: 2.9, whip: 1.0, strikeouts: 120, innings: 95 },
      'Pitcher B': { era: 3.2, whip: 1.1, strikeouts: 110, innings: 100 },
      'Pitcher C': { era: 3.8, whip: 1.18, strikeouts: 90, innings: 88 },
      'Pitcher D': { era: 4.1, whip: 1.25, strikeouts: 80, innings: 90 }
    }
  })

  const result = await generatePredictions(redis)

  assert.equal(result.predictionsCreated, 2)
  assert.equal(redis.getCount('mlb:stats:pitchers'), 1)
})

test('prediction pipeline still fails fast when a missing matchKey cannot be reconstructed', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        date: '2025-04-10T23:10:00Z',
        homeTeam: '',
        awayTeam: 'Los Angeles Dodgers',
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Los Angeles Dodgers': 1600
    },
    'mlb:stats:bullpen': {}
  })

  await assert.rejects(
    () => generatePredictions(redis),
    error => {
      assert.equal(error instanceof ValidationError, true)
      assert.match(error.message, /matchKey|homeTeam/)
      return true
    }
  )
})

test('prediction pipeline requires cached stats to exist before model execution', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600
    }
  })

  await assert.rejects(
    () => generatePredictions(redis),
    error => {
      assert.match(error.message, /Stats cache missing/)
      assert.match(error.message, /runStatsPipeline/)
      return true
    }
  )
})

test('edge pipeline fails fast when odds payload fields are removed or renamed', async () => {
  const redis = createMockRedis({
    'mlb:predictions:today': [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homeWinProbability: 0.31,
        awayWinProbability: 0.69
      }
    ],
    'mlb:odds:today': [
      {
        gameId: 'odds-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        commenceTime: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homeMoneyline: 170,
        sportsbook: 'draftkings',
        lastUpdated: '2025-04-10T18:00:00Z'
      }
    ]
  })

  await assert.rejects(
    () => generateEdges(redis),
    error => {
      assert.equal(error instanceof ValidationError, true)
      assert.match(error.message, /awayMoneyline/)
      return true
    }
  )
})


test('prediction output includes advanced pitcher feature inputs for scoring', async () => {
  const redis = createMockRedis({
    'mlb:games:today': [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homePitcher: 'Pitcher A',
        awayPitcher: 'Pitcher B',
        venue: 'Sutter Health Park',
        ballpark: {
          venue: 'Sutter Health Park',
          classification: 'neutral',
          runFactor: 1.05,
          homeRunFactor: 1.08,
          hitsFactor: 1.03,
          doublesTriplesFactor: 1.01,
          leftHandedHitterFactor: 1.05,
          rightHandedHitterFactor: 1.04
        },
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600
    },
    'mlb:stats:bullpen': {},
    'mlb:stats:offense': {},
    'mlb:stats:pitchers': {
      'Pitcher A': {
        throwingHand: 'R', era: 2.9, whip: 1.0, strikeouts: 120, innings: 95, xera: 3.05, fip: 3.12, xfip: 3.2,
        strikeoutRate: 0.31, walkRate: 0.06, strikeoutMinusWalkRate: 0.25, battingAverageAgainst: 0.211,
        expectedBattingAverageAgainst: 0.219, sluggingAgainst: 0.338, expectedSluggingAgainst: 0.349,
        hardHitRate: 0.32, barrelRate: 0.07, averageExitVelocity: 88.1
      },
      'Pitcher B': {
        throwingHand: 'L', era: 4.2, whip: 1.29, strikeouts: 95, innings: 98, xera: 4.05, fip: 4.12, xfip: 4.2,
        strikeoutRate: 0.23, walkRate: 0.08, strikeoutMinusWalkRate: 0.15, battingAverageAgainst: 0.251,
        expectedBattingAverageAgainst: 0.244, sluggingAgainst: 0.412, expectedSluggingAgainst: 0.401,
        hardHitRate: 0.4, barrelRate: 0.09, averageExitVelocity: 90.4
      }
    },
    'mlb:stats:offense': {
      'Oakland Athletics': {
        runsPerGame: 4.05, battingAverage: 0.241, onBasePercentage: 0.309, sluggingPercentage: 0.394, ops: 0.703, isolatedPower: 0.153, strikeoutRate: 0.239, walkRate: 0.079, weightedOnBaseAverage: 0.307, weightedRunsCreatedPlus: 95, expectedBattingAverage: 0.244, expectedSlugging: 0.401, expectedWeightedOnBaseAverage: 0.311, hardHitRate: 0.368, barrelRate: 0.074,
        splits: { vsRightHanded: { ops: 0.694, weightedRunsCreatedPlus: 91 }, vsLeftHanded: { ops: 0.742, weightedRunsCreatedPlus: 103 }, home: { ops: 0.716 }, away: { ops: 0.689 }, last7Days: { runsPerGame: 4.5, ops: 0.735 }, last14Days: { runsPerGame: 4.2, ops: 0.719 } }
      },
      'Los Angeles Dodgers': {
        runsPerGame: 5.62, battingAverage: 0.272, onBasePercentage: 0.351, sluggingPercentage: 0.472, ops: 0.823, isolatedPower: 0.2, strikeoutRate: 0.207, walkRate: 0.101, weightedOnBaseAverage: 0.356, weightedRunsCreatedPlus: 121, expectedBattingAverage: 0.279, expectedSlugging: 0.485, expectedWeightedOnBaseAverage: 0.362, hardHitRate: 0.441, barrelRate: 0.101,
        splits: { vsRightHanded: { ops: 0.818, weightedRunsCreatedPlus: 119 }, vsLeftHanded: { ops: 0.838, weightedRunsCreatedPlus: 126 }, home: { ops: 0.829 }, away: { ops: 0.816 }, last7Days: { runsPerGame: 5.8, ops: 0.847 }, last14Days: { runsPerGame: 5.5, ops: 0.831 } }
      }
    }
  })

  const result = await generatePredictions(redis)

  assert.equal(result.predictionsCreated, 1)
  const prediction = result.predictions[0]
  assert.equal(prediction.pitcherModel.home.rating > prediction.pitcherModel.away.rating, true)
  assert.equal(prediction.pitcherModel.home.stats.xera, 3.05)
  assert.equal(prediction.pitcherModel.home.stats.strikeoutMinusWalkRate, 0.25)
  assert.equal(Array.isArray(prediction.pitcherModel.home.components), true)
  assert.equal(prediction.bullpenModel.home.rating >= 0, true)
  assert.equal(Array.isArray(prediction.bullpenModel.home.components), true)
  assert.equal(prediction.offenseModel.away.rating > prediction.offenseModel.home.rating, true)
  assert.equal(prediction.offenseModel.home.derived.opposingPitcherHand, 'L')
  assert.equal(prediction.offenseModel.away.stats.overall.weightedRunsCreatedPlus, 121)
  assert.equal(prediction.ballpark.classification, 'neutral')
  assert.equal(prediction.ballparkModel.away.ratingAdjustment > prediction.ballparkModel.home.ratingAdjustment, true)
  assert.equal(prediction.ballparkModel.away.factors.homeRunFactor, 1.08)
  assert.equal(prediction.ballparkModel.home.expectedRuns > 0, true)
})
