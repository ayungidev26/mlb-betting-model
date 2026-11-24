import test from "node:test"
import assert from "node:assert/strict"
import { loadDashboardSlate } from "../lib/dashboardSlate.js"

const dateKey = "2026-10-29"
const game = { gameId: 123, matchKey: "v2|mlb|123", date: "2026-10-30T02:00:00Z" }
const calendar = async () => ({
  ok: true,
  headers: { get: () => "application/json" },
  json: async () => ({
    seasons: [{
      seasonId: "2026",
      seasonStartDate: "2026-02-20",
      offseasonStartDate: "2026-10-29",
      offSeasonEndDate: "2026-12-31"
    }]
  })
})

test("a stale or mismatched schedule suppresses cached games and markets", async () => {
  for (const metadata of [null, { dateKey: "2026-10-28", gamesToday: 1 }, { dateKey, gamesToday: 0 }]) {
    const keys = { "mlb:games:today": [game], "mlb:games:today:meta": metadata }
    const dashboard = await loadDashboardSlate({
      async get(key) {
        assert.ok(Object.hasOwn(keys, key))
        return keys[key]
      }
    }, dateKey, calendar)

    assert.equal(dashboard.slate.status, "unavailable")
    assert.deepEqual(dashboard.games, [])
  }
})

test("a verified schedule only displays predictions with a matching MLB game ID and Eastern date", async () => {
  const predictions = [
    { ...game, gameId: "123", matchKey: "legacy" },
    { ...game, gameId: 456 },
    { ...game, date: "2026-10-29T02:00:00Z" }
  ]
  const keys = {
    "mlb:games:today": [{ ...game, lifecycle: "completed" }],
    "mlb:games:today:meta": { dateKey, gamesToday: 1 },
    "mlb:predictions:today": predictions,
    "mlb:edges:today": [{ matchKey: game.matchKey, edge: 0.2 }]
  }
  const dashboard = await loadDashboardSlate({ get: async (key) => keys[key] }, dateKey, calendar)

  assert.equal(dashboard.slate.status, "scheduled")
  assert.equal(dashboard.games.length, 1)
  assert.equal(dashboard.games[0].matchKey, game.matchKey)
  assert.equal(dashboard.games[0].lifecycle, "completed")
  assert.equal(dashboard.games[0].edge, null)
})

test("a verified empty slate follows MLB's season boundaries, including October closeout", async () => {
  for (const [day, status] of [["2026-10-28", "empty"], [dateKey, "offseason"]]) {
    const keys = { "mlb:games:today": [], "mlb:games:today:meta": { dateKey: day, gamesToday: 0 } }
    const dashboard = await loadDashboardSlate({ get: async (key) => keys[key] }, day, calendar)
    assert.equal(dashboard.slate.status, status)
    assert.deepEqual(dashboard.games, [])
  }
})
