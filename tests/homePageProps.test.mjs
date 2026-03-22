import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHomePageProps,
  buildHomePageViewModel,
  loadCachedEdgesFromApi,
  loadHomePageData
} from '../lib/homePageProps.js'


test('buildHomePageViewModel returns a friendly empty summary when no predictions are available', () => {
  assert.deepEqual(buildHomePageViewModel({ predictions: null, edges: null }), {
    games: [],
    summary: {
      predictionsCreated: 0,
      recommendedBets: 0,
      message: 'No cached predictions are available yet.'
    }
  })
})

test('buildHomePageProps merges cached predictions with their strongest edges', async () => {
  const result = await buildHomePageProps(async () => ({
    predictions: [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homeWinProbability: 0.41,
        awayWinProbability: 0.59,
        homePitcher: 'JP Sears',
        awayPitcher: 'Yoshinobu Yamamoto'
      }
    ],
    edges: [
      {
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        team: 'Los Angeles Dodgers',
        edge: 0.055,
        odds: -118,
        sportsbook: 'draftkings',
        impliedProbability: 0.535,
        recommendation: 'Bet'
      }
    ]
  }))

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
          awayWinProbability: 0.59,
          homePitcher: 'JP Sears',
          awayPitcher: 'Yoshinobu Yamamoto',
          edge: 0.055,
          recommendedBet: 'Los Angeles Dodgers',
          recommendedOdds: -118,
          sportsbook: 'draftkings',
          impliedProbability: 0.535,
          recommendation: 'Bet'
        }
      ],
      summary: {
        predictionsCreated: 1,
        recommendedBets: 1,
        message: 'Showing cached predictions.'
      },
      error: ''
    }
  })
})

test('buildHomePageProps sorts games by highest edge first', async () => {
  const result = await buildHomePageProps(async () => ({
    predictions: [
      {
        gameId: 'game-1',
        matchKey: '2025-04-10|Team A|Team B',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Team B',
        awayTeam: 'Team A'
      },
      {
        gameId: 'game-2',
        matchKey: '2025-04-10|Team C|Team D',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Team D',
        awayTeam: 'Team C'
      },
      {
        gameId: 'game-3',
        matchKey: '2025-04-10|Team E|Team F',
        date: '2025-04-10T23:10:00Z',
        homeTeam: 'Team F',
        awayTeam: 'Team E'
      }
    ],
    edges: [
      {
        matchKey: '2025-04-10|Team C|Team D',
        team: 'Team C',
        edge: 0.031,
        odds: -110
      },
      {
        matchKey: '2025-04-10|Team A|Team B',
        team: 'Team A',
        edge: 0.062,
        odds: -125
      }
    ]
  }))

  assert.deepEqual(
    result.props.games.map((game) => [game.gameId, game.edge]),
    [
      ['game-1', 0.062],
      ['game-2', 0.031],
      ['game-3', null]
    ]
  )
})

test('buildHomePageProps reports cache loading failures as a generic page error', async () => {
  const result = await buildHomePageProps(async () => {
    throw new Error('redis unavailable')
  })

  assert.deepEqual(result, {
    props: {
      games: [],
      summary: {
        predictionsCreated: 0,
        recommendedBets: 0,
        message: 'Cached predictions are currently unavailable.'
      },
      error: 'Cached predictions are currently unavailable.'
    }
  })
})

test('loadCachedEdgesFromApi reads cached edges from the public edges endpoint', async () => {
  const requestedUrls = []

  const edges = await loadCachedEdgesFromApi(
    {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-proto': 'https'
      }
    },
    async (url) => {
      requestedUrls.push(String(url))

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            edges: [
              {
                matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
                team: 'Los Angeles Dodgers',
                edge: 0.055
              }
            ]
          }
        }
      }
    }
  )

  assert.deepEqual(requestedUrls, ['https://localhost:3000/api/edges'])
  assert.equal(edges.length, 1)
})

test('loadHomePageData fetches predictions and edges in parallel from public endpoints', async () => {
  const requestedUrls = []

  const pageData = await loadHomePageData(
    {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-proto': 'https'
      }
    },
    async (url) => {
      requestedUrls.push(String(url))

      if (String(url).endsWith('/api/predictions')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { predictions: [{ matchKey: 'prediction-1' }] }
          }
        }
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return { edges: [{ matchKey: 'prediction-1', edge: 0.04 }] }
        }
      }
    }
  )

  assert.deepEqual(requestedUrls.sort(), [
    'https://localhost:3000/api/edges',
    'https://localhost:3000/api/predictions'
  ])
  assert.deepEqual(pageData, {
    predictions: [{ matchKey: 'prediction-1' }],
    edges: [{ matchKey: 'prediction-1', edge: 0.04 }]
  })
})
