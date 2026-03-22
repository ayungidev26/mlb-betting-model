import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_BALLPARK_FACTOR,
  getBallparkHandednessFactor,
  resolveBallparkFactors
} from '../lib/ballparkFactors.js'

test('resolveBallparkFactors matches venue aliases and derives park classification', async () => {
  const ballpark = await resolveBallparkFactors({
    venue: 'Guaranteed Rate Field',
    homeTeam: 'Chicago White Sox'
  })

  assert.equal(ballpark.venue, 'Guaranteed Rate Field')
  assert.equal(ballpark.classification, 'neutral')
  assert.equal(ballpark.homeRunFactor, 1.11)
  assert.equal(getBallparkHandednessFactor(ballpark, 'R'), 1.04)
})

test('resolveBallparkFactors falls back to a neutral environment for unknown parks', async () => {
  const ballpark = await resolveBallparkFactors({
    venue: 'Some Future Dome',
    homeTeam: 'Expansion Club'
  })

  assert.equal(ballpark.isUnknown, true)
  assert.equal(ballpark.runFactor, DEFAULT_BALLPARK_FACTOR)
  assert.equal(ballpark.classification, 'neutral')
})
