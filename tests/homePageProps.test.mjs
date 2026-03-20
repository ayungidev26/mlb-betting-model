import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHomePageProps } from '../lib/homePageProps.js'

test('buildHomePageProps returns cached predictions without triggering the model pipeline', async () => {
  const result = await buildHomePageProps(async () => ([
    {
      gameId: 'game-1',
      matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
      date: '2025-04-10T23:10:00Z',
      homeTeam: 'Oakland Athletics',
      awayTeam: 'Los Angeles Dodgers',
      homeWinProbability: 0.41,
      awayWinProbability: 0.59
    }
  ]))

  assert.deepEqual(result, {
    props: {
      games: [
        {
          gameId: 'game-1',
          matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
          date: '2025-04-10T23:10:00Z',
          homeTeam: 'Oakland Athletics',
          awayTeam: 'Los Angeles Dodgers',
          homeWinProbability: 0.41,
          awayWinProbability: 0.59
        }
      ],
      summary: {
        predictionsCreated: 1,
        message: 'Showing cached predictions.'
      },
      error: ''
    }
  })
})

test('buildHomePageProps reports cache loading failures as a non-mutating page error', async () => {
  const result = await buildHomePageProps(async () => {
    throw new Error('redis unavailable')
  })

  assert.deepEqual(result, {
    props: {
      games: [],
      summary: {
        predictionsCreated: 0,
        message: 'Cached predictions are currently unavailable.'
      },
      error: 'redis unavailable'
    }
  })
})
