import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeOddsGame } from '../lib/normalizeOdds.js'
import { findEdgesFromData } from '../lib/findEdges.js'

test('normalizeOddsGame retains all sportsbook h2h lines while preserving canonical top-level fields', () => {
  const normalized = normalizeOddsGame({
    id: 'odds-game-2',
    commence_time: '2025-04-11T00:10:00Z',
    home_team: 'Houston Astros',
    away_team: 'Seattle Mariners',
    bookmakers: [
      {
        key: 'draftkings',
        title: 'DraftKings',
        last_update: '2025-04-10T19:00:00Z',
        markets: [{
          key: 'h2h',
          outcomes: [
            { name: 'Houston Astros', price: -108 },
            { name: 'Seattle Mariners', price: -102 }
          ]
        }]
      },
      {
        key: 'fanduel',
        title: 'FanDuel',
        last_update: '2025-04-10T19:01:00Z',
        markets: [{
          key: 'h2h',
          outcomes: [
            { name: 'Houston Astros', price: -105 },
            { name: 'Seattle Mariners', price: -110 }
          ]
        }]
      }
    ]
  })

  assert.equal(normalized.sportsbooks.length, 2)
  assert.equal(normalized.sportsbook, 'draftkings')
  assert.equal(normalized.homeMoneyline, -108)
  assert.equal(normalized.awayMoneyline, -102)
})

test('findEdges uses best available side price and exposes DraftKings/FanDuel lookups', () => {
  const { edges } = findEdgesFromData(
    [{
      gameId: 'game-2',
      matchKey: '2025-04-11|Seattle Mariners|Houston Astros',
      homeTeam: 'Houston Astros',
      awayTeam: 'Seattle Mariners',
      homeWinProbability: 0.56,
      awayWinProbability: 0.44
    }],
    [{
      gameId: 'odds-2',
      matchKey: '2025-04-11|Seattle Mariners|Houston Astros',
      commenceTime: '2025-04-11T00:10:00Z',
      homeTeam: 'Houston Astros',
      awayTeam: 'Seattle Mariners',
      homeMoneyline: -108,
      awayMoneyline: -102,
      sportsbook: 'draftkings',
      lastUpdated: '2025-04-10T19:00:00Z',
      sportsbooks: [
        {
          sportsbook: 'draftkings',
          sportsbookName: 'DraftKings',
          market: 'h2h',
          selections: [
            { name: 'Houston Astros', price: -108 },
            { name: 'Seattle Mariners', price: -102 }
          ],
          lastUpdated: '2025-04-10T19:00:00Z'
        },
        {
          sportsbook: 'fanduel',
          sportsbookName: 'FanDuel',
          market: 'h2h',
          selections: [
            { name: 'Houston Astros', price: -105 },
            { name: 'Seattle Mariners', price: -110 }
          ],
          lastUpdated: '2025-04-10T19:01:00Z'
        }
      ]
    }]
  )

  assert.equal(edges.length, 1)
  assert.equal(edges[0].team, 'Houston Astros')
  assert.equal(edges[0].odds, -105)
  assert.equal(edges[0].bestSportsbook, 'fanduel')
  assert.equal(edges[0].draftKingsOdds, -108)
  assert.equal(edges[0].fanDuelOdds, -105)
})
