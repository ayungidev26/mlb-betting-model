import test from 'node:test'
import assert from 'node:assert/strict'

import { moneylineToImpliedProbability } from '../lib/findEdges.js'
import { normalizeBullpenStatRecord } from '../lib/bullpenStats.js'
import {
  buildBullpenRatingDetails,
  calculateBullpenRating,
  getBullpenRating
} from '../model/bullpenRatings.js'

test('moneylineToImpliedProbability converts positive and negative moneylines', () => {
  assert.equal(Number(moneylineToImpliedProbability(120).toFixed(4)), 0.4545)
  assert.equal(Number(moneylineToImpliedProbability(-150).toFixed(4)), 0.6)
  assert.equal(moneylineToImpliedProbability('120'), null)
})

test('calculateBullpenRating scores deeper bullpen inputs higher than weak bullpens', () => {
  const strongBullpen = {
    era: 2.95,
    whip: 1.08,
    fip: 3.1,
    xfip: 3.2,
    strikeoutRate: 0.285,
    walkRate: 0.075,
    strikeoutMinusWalkRate: 0.21,
    homeRunsPer9: 0.82,
    battingAverageAgainst: 0.214,
    leftOnBaseRate: 0.752,
    hardHitRate: 0.333,
    barrelRate: 0.066,
    averageExitVelocity: 87.5,
    usage: {
      inningsLast3Days: 3.2,
      inningsLast5Days: 6.4,
      relieversUsedYesterday: 2,
      keyRelieversBackToBack: false
    }
  }
  const weakBullpen = {
    era: 4.7,
    whip: 1.41,
    fip: 4.8,
    xfip: 4.7,
    strikeoutRate: 0.198,
    walkRate: 0.108,
    strikeoutMinusWalkRate: 0.09,
    homeRunsPer9: 1.42,
    battingAverageAgainst: 0.262,
    leftOnBaseRate: 0.682,
    hardHitRate: 0.421,
    barrelRate: 0.095,
    averageExitVelocity: 90.5,
    usage: {
      inningsLast3Days: 8.1,
      inningsLast5Days: 13.7,
      relieversUsedYesterday: 5,
      keyRelieversBackToBack: true
    }
  }

  assert.equal(calculateBullpenRating(strongBullpen) > calculateBullpenRating(weakBullpen), true)
})

test('buildBullpenRatingDetails returns stat snapshots and fatigue components', () => {
  const details = buildBullpenRatingDetails({
    era: 3.2,
    whip: 1.18,
    strikeoutRate: 0.27,
    walkRate: 0.08,
    strikeoutMinusWalkRate: 0.19,
    usage: {
      inningsLast3Days: 4,
      inningsLast5Days: 7,
      relieversUsedYesterday: 3,
      keyRelieversBackToBack: false
    }
  })

  assert.equal(details.rating > 0, true)
  assert.equal(details.stats.usage.inningsLast3Days, 4)
  assert.equal(details.components.some((component) => component.label === 'Bullpen IP last 3 days'), true)
})

test('normalizeBullpenStatRecord falls back to calculated K-BB% and preserves fatigue payloads', () => {
  const record = normalizeBullpenStatRecord(
    {
      era: '3.40',
      whip: '1.17',
      inningsPitched: '120.2',
      strikeOuts: '141',
      baseOnBalls: '44',
      battersFaced: '489',
      homeRuns: '15',
      avg: '.221',
      leftOnBasePercentage: '74.2'
    },
    {
      hardHitRate: 0.344,
      barrelRate: 0.072,
      averageExitVelocity: 88.2
    },
    { fipConstant: 3.2, hrPerFlyBallRate: 0.105 },
    {
      inningsLast3Days: 2.1,
      inningsLast5Days: 5.2,
      relieversUsedYesterday: 2,
      keyRelieversBackToBack: false
    }
  )

  assert.equal(record.strikeoutRate, 0.2883)
  assert.equal(record.walkRate, 0.09)
  assert.equal(record.strikeoutMinusWalkRate, 0.1983)
  assert.equal(record.usage.relieversUsedYesterday, 2)
})

test('getBullpenRating returns zero for missing teams and uses the named bullpen entry', () => {
  const bullpenStats = {
    'Seattle Mariners': { era: 3.2, whip: 1.18 },
    'Houston Astros': { era: 4.05, whip: 1.32 }
  }

  assert.equal(getBullpenRating('Seattle Mariners', bullpenStats) > getBullpenRating('Houston Astros', bullpenStats), true)
  assert.equal(getBullpenRating('Chicago Cubs', bullpenStats), 0)
  assert.equal(getBullpenRating(null, bullpenStats), 0)
})
