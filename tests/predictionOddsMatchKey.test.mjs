import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeOddsGame } from '../lib/normalizeOdds.js'
import { predictGame } from '../model/predictor.js'

test('normalizeOddsGame stores the canonical matchKey for an odds record', () => {
  const normalized = normalizeOddsGame({
    id: 'odds-game-1',
    commence_time: '2025-04-10T23:10:00Z',
    home_team: 'Athletics',
    away_team: 'LA Dodgers',
    bookmakers: [
      {
        key: 'draftkings',
        last_update: '2025-04-10T18:00:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Athletics', price: 135 },
              { name: 'LA Dodgers', price: -145 }
            ]
          }
        ]
      }
    ]
  })

  assert.deepEqual(
    normalized,
    {
      gameId: 'odds-game-1',
      matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
      commenceTime: '2025-04-10T23:10:00Z',
      homeTeam: 'Athletics',
      awayTeam: 'LA Dodgers',
      homeMoneyline: 135,
      awayMoneyline: -145,
      sportsbook: 'draftkings',
      lastUpdated: '2025-04-10T18:00:00Z'
    }
  )
})

test('predictGame carries matchKey forward from the game object', async () => {
  const prediction = await predictGame(
    {
      gameId: 123,
      matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
      date: '2025-04-10T23:10:00Z',
      homeTeam: 'Oakland Athletics',
      awayTeam: 'Los Angeles Dodgers',
      homePitcher: null,
      awayPitcher: null
    },
    {
      'Oakland Athletics': 1500,
      'Los Angeles Dodgers': 1550
    },
    null
  )

  assert.equal(
    prediction.matchKey,
    '2025-04-10|Los Angeles Dodgers|Oakland Athletics'
  )
})
