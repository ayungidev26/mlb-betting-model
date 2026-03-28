import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseCommenceTimeMillis,
  isStarted,
  splitOddsByStartStatus
} from '../lib/oddsTime.js'

test('parseCommenceTimeMillis only accepts ISO timestamps with timezone and returns millis', () => {
  const valid = '2025-04-11T00:10:00Z'

  assert.equal(
    parseCommenceTimeMillis(valid),
    Date.parse(valid)
  )
  assert.equal(parseCommenceTimeMillis('2025-04-11T00:10:00'), null)
  assert.equal(parseCommenceTimeMillis('04/11/2025 00:10:00 UTC'), null)
  assert.equal(parseCommenceTimeMillis(null), null)
})

test('isStarted applies the configured buffer and handles invalid commenceTime deterministically', () => {
  const nowUtc = Date.parse('2025-04-11T00:00:00Z')

  assert.equal(isStarted('2025-04-10T23:58:00Z', nowUtc, 2), true)
  assert.equal(isStarted('2025-04-10T23:58:01Z', nowUtc, 2), false)
  assert.equal(isStarted('invalid-time', nowUtc, 2), null)
  assert.equal(isStarted('2025-04-10T23:58:00Z', Number.NaN, 2), null)
})

test('splitOddsByStartStatus separates started/upcoming records and counts invalid records', () => {
  const nowUtc = Date.parse('2025-04-11T00:00:00Z')
  const records = [
    { matchKey: 'started', commenceTime: '2025-04-10T23:55:00Z' },
    { matchKey: 'upcoming', commenceTime: '2025-04-11T00:05:00Z' },
    { matchKey: 'invalid-string', commenceTime: 'not-iso' },
    { matchKey: 'invalid-missing', commenceTime: null }
  ]

  const split = splitOddsByStartStatus(records, nowUtc, 2)

  assert.deepEqual(
    split.started.map(record => record.matchKey),
    ['started']
  )
  assert.deepEqual(
    split.upcoming.map(record => record.matchKey),
    ['upcoming']
  )
  assert.deepEqual(
    split.invalid.map(record => record.matchKey),
    ['invalid-string', 'invalid-missing']
  )
  assert.equal(split.invalidCount, 2)
})
