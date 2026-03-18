import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMatchKey } from '../lib/matchKey.js'
import { normalizeMlbTeamName } from '../lib/teamNames.js'

test('normalizes known MLB team aliases before building a match key', () => {
  assert.equal(normalizeMlbTeamName('LA Dodgers'), 'Los Angeles Dodgers')
  assert.equal(normalizeMlbTeamName('LA Angels'), 'Los Angeles Angels')
  assert.equal(normalizeMlbTeamName('Athletics'), 'Oakland Athletics')
})

test('buildMatchKey returns a joinable key with normalized team names', () => {
  assert.equal(
    buildMatchKey(
      '2025-04-10T23:10:00Z',
      'LA Dodgers',
      'Athletics'
    ),
    '2025-04-10|Los Angeles Dodgers|Oakland Athletics'
  )
})

test('buildMatchKey preserves already canonical names', () => {
  assert.equal(
    buildMatchKey(
      '2025-04-10T23:10:00Z',
      'New York Yankees',
      'Boston Red Sox'
    ),
    '2025-04-10|New York Yankees|Boston Red Sox'
  )
})
