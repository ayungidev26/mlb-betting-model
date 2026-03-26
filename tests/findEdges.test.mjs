import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EDGE_THRESHOLD,
  findEdgesFromData
} from '../lib/findEdges.js'

test('findEdges joins predictions to odds by matchKey and reports fallback metrics', () => {
  const { edges, matchedGames, unmatchedPredictions } = findEdgesFromData(
    [
      {
        gameId: 1,
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        homeTeam: 'Oakland Athletics',
        awayTeam: 'Los Angeles Dodgers',
        homeWinProbability: 0.44,
        awayWinProbability: 0.56
      },
      {
        gameId: 2,
        matchKey: '2025-04-10|New York Yankees|Boston Red Sox',
        homeTeam: 'Boston Red Sox',
        awayTeam: 'New York Yankees',
        homeWinProbability: 0.52,
        awayWinProbability: 0.48
      },
      {
        gameId: 3,
        homeTeam: 'Chicago Cubs',
        awayTeam: 'Milwaukee Brewers',
        homeWinProbability: 0.51,
        awayWinProbability: 0.49
      }
    ],
    [
      {
        gameId: 'odds-1',
        matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
        homeMoneyline: -110,
        awayMoneyline: 120,
        sportsbook: 'draftkings',
        lastUpdated: '2025-04-10T18:00:00Z'
      }
    ]
  )

  assert.equal(matchedGames, 1)
  assert.equal(unmatchedPredictions, 2)
  assert.equal(edges.length, 1)
  assert.deepEqual(edges[0], {
    gameId: 1,
    matchKey: '2025-04-10|Los Angeles Dodgers|Oakland Athletics',
    team: 'Los Angeles Dodgers',
    market: 'moneyline',
    sportsbook: 'draftkings',
    sportsbookName: 'draftkings',
    odds: 120,
    bestOdds: 120,
    bestSportsbook: 'draftkings',
    bestSportsbookName: 'draftkings',
    draftKingsOdds: null,
    fanDuelOdds: null,
    modelProbability: 0.56,
    impliedProbability: 0.4545,
    edge: 0.1055,
    threshold: EDGE_THRESHOLD,
    homeTeam: 'Oakland Athletics',
    awayTeam: 'Los Angeles Dodgers',
    lastUpdated: '2025-04-10T18:00:00Z'
  })
})

test('findEdges keeps the edge threshold at greater than 0.03', () => {
  const { edges } = findEdgesFromData(
    [
      {
        gameId: 4,
        matchKey: '2025-04-11|Seattle Mariners|Houston Astros',
        homeTeam: 'Houston Astros',
        awayTeam: 'Seattle Mariners',
        homeWinProbability: 0.5299,
        awayWinProbability: 0.4701
      }
    ],
    [
      {
        gameId: 'odds-4',
        matchKey: '2025-04-11|Seattle Mariners|Houston Astros',
        homeMoneyline: 100,
        awayMoneyline: -100,
        sportsbook: 'fanduel',
        lastUpdated: '2025-04-11T17:00:00Z'
      }
    ]
  )

  assert.equal(edges.length, 0)
})
