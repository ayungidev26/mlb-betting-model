import test from "node:test"
import assert from "node:assert/strict"

import {
  assertFreshTeamRatings,
  getRatingsFreshness,
  validateDatedCache
} from "../lib/cacheFreshness.js"

test("dated cache accepts correct metadata and legacy payloads without metadata", () => {
  assert.deepEqual(validateDatedCache({ payload: [], metadata: null, expectedDateKey: "2026-08-09", label: "Odds" }), { legacy: true, dateKey: null })
  assert.deepEqual(validateDatedCache({ payload: [], metadata: { dateKey: "2026-08-09", records: 0 }, expectedDateKey: "2026-08-09", label: "Odds" }), { legacy: false, dateKey: "2026-08-09" })
})

test("dated cache rejects stale, malformed, and payload-disagreeing metadata", () => {
  assert.throws(() => validateDatedCache({ payload: [], metadata: { dateKey: "2026-08-08" }, expectedDateKey: "2026-08-09", label: "Odds" }), /stale/)
  assert.throws(() => validateDatedCache({ payload: [], metadata: "bad-json", expectedDateKey: "2026-08-09", label: "Odds" }), /malformed/)
  assert.throws(() => validateDatedCache({ payload: [{}], metadata: { dateKey: "2026-08-09", records: 2 }, expectedDateKey: "2026-08-09", label: "Odds" }), /record count disagreement/)
  assert.throws(() => validateDatedCache({ payload: [{}], metadata: { dateKey: "2026-08-09" }, expectedDateKey: "2026-08-09", label: "Odds", payloadDateKeys: ["2026-08-08"] }), /date disagreement/)
})

test("ratings freshness accepts current metadata and rejects missing, stale, and future metadata", () => {
  const now = new Date("2026-08-09T12:00:00Z")
  const fresh = { generatedAt: "2026-08-08T12:00:00Z", dataThrough: "2026-08-08", season: 2026 }
  assert.equal(getRatingsFreshness(fresh, now).fresh, true)
  assert.throws(() => assertFreshTeamRatings(null, now), /metadata missing/)
  assert.throws(() => assertFreshTeamRatings({ ...fresh, generatedAt: "2026-07-01T00:00:00Z" }, now), /generated more than/)
  assert.throws(() => assertFreshTeamRatings({ ...fresh, dataThrough: "2026-07-01" }, now), /historical results/)
  assert.throws(() => assertFreshTeamRatings({ ...fresh, generatedAt: "2026-08-10T00:00:00Z" }, now), /future/)
})
