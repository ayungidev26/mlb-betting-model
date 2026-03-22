import test from 'node:test'
import assert from 'node:assert/strict'

process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.test'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const { generateEdges, generatePredictions } = await import('../lib/pipeline.js')
import { ValidationError } from '../lib/payloadValidation.js'

function createMockRedis(seed = {}) {
  const store = new Map(Object.entries(seed))

  return {
    async get(key) {
      return store.get(key)
    },
    async set(key, value) {
      store.set(key, value)
      return 'OK'
    },
    dump(key) {
      return store.get(key)
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
