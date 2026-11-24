import test from "node:test"
import assert from "node:assert/strict"
import { loadStatsSeason, publishSeasonStats } from "../lib/seasonStats.js"

test("a new season preserves the existing cache and never fills gaps with another season's stats", async () => {
  const legacyBullpen = { "2026 bullpen": { era: 3.25 } }
  const legacyOffense = { "2026 offense": { ops: 0.75 } }
  const store = new Map([
    ["mlb:stats:bullpen", legacyBullpen],
    ["mlb:stats:bullpen:meta", { dateKey: "2026-10-01", records: 1 }],
    ["mlb:stats:offense", legacyOffense],
    ["mlb:stats:offense:meta", { lastUpdatedAt: "2026-10-01T12:00:00Z", records: 1 }]
  ])
  const redis = {
    async get(key) { return store.get(key) ?? null },
    async set(key, value, options) {
      if (!options?.nx || !store.has(key)) store.set(key, value)
    }
  }

  const beforeRollover = await loadStatsSeason(redis, null, 2027)
  assert.equal(beforeRollover.season, 2026)
  assert.deepEqual(beforeRollover.seasons, [2027, 2026])
  assert.equal(beforeRollover.sections.bullpen.meta.season, 2026)
  assert.equal((await loadStatsSeason(redis, 2027, 2027)).summary.availableSections, 0)

  const newBullpen = { "2027 bullpen": { era: 3.67 } }
  await publishSeasonStats(redis, {
    kind: "bullpen", candidate: newBullpen, metadata: { season: 2027, records: 1 }
  })
  const latest = await loadStatsSeason(redis, null, 2027)
  assert.equal(latest.season, 2027)
  assert.deepEqual(latest.sections.bullpen.data, newBullpen)
  assert.equal(latest.sections.offense.data, null)

  const archived = await loadStatsSeason(redis, 2026, 2027)
  assert.deepEqual(archived.sections.bullpen.data, legacyBullpen)
  assert.deepEqual(archived.sections.offense.data, legacyOffense)
  assert.deepEqual(store.get("mlb:stats:bullpen"), newBullpen)
})
