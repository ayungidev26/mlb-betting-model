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
    'mlb:stats:bullpen': null
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
    'mlb:stats:bullpen': null,
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
    'mlb:stats:bullpen': null
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
        seasonType: 'regular'
      }
    ],
    'mlb:ratings:teams': {
      'Oakland Athletics': 1450,
      'Los Angeles Dodgers': 1600
    },
    'mlb:stats:bullpen': null,
    'mlb:stats:pitchers': {
      'Pitcher A': {
        era: 2.9, whip: 1.0, strikeouts: 120, innings: 95, xera: 3.05, fip: 3.12, xfip: 3.2,
        strikeoutRate: 0.31, walkRate: 0.06, strikeoutMinusWalkRate: 0.25, battingAverageAgainst: 0.211,
        expectedBattingAverageAgainst: 0.219, sluggingAgainst: 0.338, expectedSluggingAgainst: 0.349,
        hardHitRate: 0.32, barrelRate: 0.07, averageExitVelocity: 88.1
      },
      'Pitcher B': {
        era: 4.2, whip: 1.29, strikeouts: 95, innings: 98, xera: 4.05, fip: 4.12, xfip: 4.2,
        strikeoutRate: 0.23, walkRate: 0.08, strikeoutMinusWalkRate: 0.15, battingAverageAgainst: 0.251,
        expectedBattingAverageAgainst: 0.244, sluggingAgainst: 0.412, expectedSluggingAgainst: 0.401,
        hardHitRate: 0.4, barrelRate: 0.09, averageExitVelocity: 90.4
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
})
