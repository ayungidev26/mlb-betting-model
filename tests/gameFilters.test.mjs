import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_EDGE_THRESHOLD,
  filterGames,
  getAvailableBetTypes,
  getAvailableTeams,
  getGameBetType
} from '../lib/gameFilters.js'

const sampleGames = [
  {
    awayTeam: 'Atlanta Braves',
    homeTeam: 'New York Mets',
    edge: 0.041,
    market: 'moneyline'
  },
  {
    awayTeam: 'Los Angeles Dodgers',
    homeTeam: 'San Diego Padres',
    edge: 0.018,
    betType: 'total'
  },
  {
    awayTeam: 'Chicago Cubs',
    homeTeam: 'St. Louis Cardinals',
    edge: null,
    recommendedMarket: 'run line'
  }
]

test('getGameBetType defaults to moneyline when a market is missing', () => {
  assert.equal(getGameBetType({}), 'moneyline')
  assert.equal(getGameBetType({ market: ' Total ' }), 'total')
})

test('getAvailableBetTypes returns sorted unique market values', () => {
  assert.deepEqual(getAvailableBetTypes(sampleGames), ['moneyline', 'run line', 'total'])
})

test('getAvailableTeams returns sorted unique team names', () => {
  assert.deepEqual(getAvailableTeams(sampleGames), [
    'Atlanta Braves',
    'Chicago Cubs',
    'Los Angeles Dodgers',
    'New York Mets',
    'San Diego Padres',
    'St. Louis Cardinals'
  ])
})

test('filterGames applies minimum edge, bet type, and team filters together', () => {
  assert.deepEqual(filterGames(sampleGames, {
    minimumEdge: 0.03,
    betType: 'moneyline',
    team: 'New York Mets'
  }), [sampleGames[0]])
})

test('filterGames excludes games without a numeric edge when a threshold is requested', () => {
  assert.deepEqual(filterGames(sampleGames, { minimumEdge: DEFAULT_EDGE_THRESHOLD }), sampleGames.slice(0, 2))
  assert.deepEqual(filterGames(sampleGames, { minimumEdge: 0.02 }), [sampleGames[0]])
})
