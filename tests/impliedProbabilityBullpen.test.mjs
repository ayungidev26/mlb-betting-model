import test from 'node:test'
import assert from 'node:assert/strict'

import { moneylineToImpliedProbability } from '../lib/findEdges.js'
import { calculateBullpenRating, getBullpenRating } from '../model/bullpenRatings.js'

test('moneylineToImpliedProbability converts positive and negative moneylines', () => {
  assert.equal(Number(moneylineToImpliedProbability(120).toFixed(4)), 0.4545)
  assert.equal(Number(moneylineToImpliedProbability(-150).toFixed(4)), 0.6)
  assert.equal(moneylineToImpliedProbability('120'), null)
})

test('calculateBullpenRating scores strong and weak bullpens predictably', () => {
  assert.equal(calculateBullpenRating({ era: 2.95, whip: 1.08 }), 110)
  assert.equal(calculateBullpenRating({ era: 4.7, whip: 1.41 }), 0)
})

test('getBullpenRating returns zero for missing teams and uses the named bullpen entry', () => {
  const bullpenStats = {
    'Seattle Mariners': { era: 3.2, whip: 1.18 },
    'Houston Astros': { era: 4.05, whip: 1.32 }
  }

  assert.equal(getBullpenRating('Seattle Mariners', bullpenStats), 75)
  assert.equal(getBullpenRating('Chicago Cubs', bullpenStats), 0)
  assert.equal(getBullpenRating(null, bullpenStats), 0)
})
