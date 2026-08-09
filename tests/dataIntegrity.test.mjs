import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMlbGameIdentity, resolveProviderGames } from '../lib/gameIdentity.js'
import { publishStatsCandidate, validateStatsCandidate } from '../lib/statsQuality.js'
import { buildPredictionBatch } from '../lib/predictionBatch.js'
import { classifyDashboardFreshness } from '../lib/homePageProps.js'

const game = (id, time, extra = {}) => ({ gameId: id, gamePk: id, matchKey: buildMlbGameIdentity(id), date: time, scheduledTime: time, awayTeam: 'New York Yankees', homeTeam: 'Boston Red Sox', ...extra })
const odd = (id, time, extra = {}) => ({ gameId: id, providerGameId: id, commenceTime: time, awayTeam: 'New York Yankees', homeTeam: 'Boston Red Sox', ...extra })

test('identity resolver keeps ordinary games and doubleheaders distinct regardless of provider order', () => {
  const schedule = [game(1, '2026-08-09T17:05:00Z'), game(2, '2026-08-09T23:05:00Z')]
  const result = resolveProviderGames(schedule, [odd('late', '2026-08-09T23:10:00Z'), odd('early', '2026-08-09T17:00:00Z')])
  assert.deepEqual(result.matches.map(x => [x.providerGame.providerGameId, x.scheduleGame.gameId]), [['late', 2], ['early', 1]])
  assert.notEqual(schedule[0].matchKey, schedule[1].matchKey)
})

test('resolver tolerates bounded time drift and rejects unmatched or ambiguous games', () => {
  assert.equal(resolveProviderGames([game(1, '2026-08-09T17:05:00Z')], [odd('x', '2026-08-09T17:35:00Z')]).matches.length, 1)
  assert.equal(resolveProviderGames([game(1, '2026-08-09T17:05:00Z')], [odd('x', '2026-08-10T17:05:00Z')]).unmatched.length, 1)
  const tied = resolveProviderGames([game(1, '2026-08-09T17:00:00Z'), game(2, '2026-08-09T19:00:00Z')], [odd('x', '2026-08-09T18:00:00Z')])
  assert.equal(tied.ambiguous.length, 1)
})

test('postponed and rescheduled MLB identities remain gamePk based', () => {
  assert.equal(buildMlbGameIdentity(123), 'v2|mlb|123')
  assert.equal(game(123, '2026-08-10T17:00:00Z', { status: 'Postponed' }).matchKey, game(123, '2026-08-11T17:00:00Z', { status: 'Scheduled' }).matchKey)
})

test('partial team stats preserve last known good current cache', async () => {
  const values = new Map([['mlb:stats:bullpen', { old: true }]])
  const redis = { set: async (k,v) => values.set(k,v), get: async k => values.get(k) }
  const games = [game(1, '2026-08-09T17:00:00Z')]
  const meta = validateStatsCandidate({ kind: 'bullpen', candidate: { 'New York Yankees': {} }, games, now: new Date('2026-08-09T12:00:00Z') })
  assert.equal(meta.status, 'degraded')
  assert.equal((await publishStatsCandidate(redis, { kind: 'bullpen', candidate: {}, metadata: meta })).published, false)
  assert.deepEqual(values.get('mlb:stats:bullpen'), { old: true })
})

test('one prediction failure is explicit and batch coverage is incomplete', async () => {
  const games = [game(1, '2026-08-09T17:00:00Z'), game(2, '2026-08-09T20:00:00Z')]
  const batch = await buildPredictionBatch(games, {}, async g => { if (g.gameId === 2) throw new Error('secret'); return { gameId: g.gameId, matchKey: g.matchKey, homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeWinProbability: .55, awayWinProbability: .45 } })
  assert.equal(batch.predictionsFailed, 1)
  assert.deepEqual(batch.failedGameIds, [2])
  assert.equal(batch.coverage, .5)
  assert.equal(batch.failures[0].message, 'prediction calculation failed')
})

test('dashboard labels stale, degraded, unavailable and compatible lineage', () => {
  const base = { dateKey: '2026-08-09', status: 'healthy', generatedAt: 'p' }
  assert.equal(classifyDashboardFreshness({ expectedDateKey: '2026-08-09' }).status, 'healthy')
  assert.equal(classifyDashboardFreshness({ predictionMetadata: base, oddsMetadata: { ...base, generatedAt: 'o' }, edgeMetadata: { ...base, predictionGeneratedAt: 'p', oddsGeneratedAt: 'o' }, expectedDateKey: '2026-08-09' }).status, 'healthy')
  assert.equal(classifyDashboardFreshness({ predictionMetadata: base, oddsMetadata: { ...base, status: 'degraded' }, edgeMetadata: base, expectedDateKey: '2026-08-09' }).status, 'degraded')
  assert.equal(classifyDashboardFreshness({ predictionMetadata: { ...base, dateKey: '2026-08-08' }, oddsMetadata: base, edgeMetadata: base, expectedDateKey: '2026-08-09' }).status, 'stale')
})
