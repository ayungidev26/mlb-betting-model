import assert from "node:assert/strict"
import test from "node:test"

import { validateProductionIntegrations } from "../lib/productionValidation.js"

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}

test("production validation uses temporary Redis data and one request per provider", async () => {
  process.env.ODDS_API_KEY = "test-only-key"
  const stored = new Map()
  const redisKeys = []
  const redisClient = {
    async set(key, value, options) {
      redisKeys.push(["set", key, options])
      assert.equal(options.nx, true)
      stored.set(key, value)
      return "OK"
    },
    async get(key) {
      redisKeys.push(["get", key])
      return stored.get(key)
    },
    async del(key) {
      redisKeys.push(["del", key])
      return stored.delete(key) ? 1 : 0
    }
  }
  const calls = []
  const fetchImpl = async (url) => {
    const target = String(url)
    calls.push(target)
    if (target.includes("statsapi.mlb.com")) return jsonResponse({ dates: [{ games: [{ gamePk: 1, gameDate: "2026-08-10T00:00:00Z", gameType: "R", teams: { home: { team: { name: "New York Yankees" } }, away: { team: { name: "Boston Red Sox" } } }, status: { detailedState: "Scheduled" } }] }] })
    if (target.includes("baseballsavant.mlb.com")) {
      return new Response("player_id,pitcher,k_percent,bb_percent,xba,xslg,xera,hard_hit_percent,barrel_batted_rate,exit_velocity_avg\n1,Test Pitcher,20,5,.2,.3,3.1,40,8,89\n", { status: 200, headers: { "content-type": "text/csv" } })
    }
    return jsonResponse([{
      id: "game-1",
      commence_time: "2026-08-10T00:00:00Z",
      home_team: "New York Yankees",
      away_team: "Boston Red Sox",
      bookmakers: [{ key: "book", title: "Book", last_update: "2026-08-09T00:00:00Z", markets: [{ key: "h2h", outcomes: [{ name: "New York Yankees", price: -120 }, { name: "Boston Red Sox", price: 110 }] }] }]
    }])
  }

  const results = await validateProductionIntegrations({ redisClient, fetchImpl })

  assert.equal(results.length, 4)
  assert.ok(results.every(result => result.success && result.schemaValid))
  assert.equal(calls.length, 3)
  assert.equal(calls.filter(url => url.includes("api.the-odds-api.com")).length, 1)
  assert.match(redisKeys[0][1], /^mlb:validation:temporary:/)
  assert.equal(redisKeys.at(-1)[0], "del")
  assert.equal(stored.size, 0)
  delete process.env.ODDS_API_KEY
})

test("production validation identifies an HTML Savant block page", async () => {
  process.env.ODDS_API_KEY = "test-only-key"
  const redisClient = {
    value: null,
    async set(key, value) { this.value = value; return "OK" },
    async get() { return this.value },
    async del() { this.value = null; return 1 }
  }
  const fetchImpl = async (url) => {
    const target = String(url)
    if (target.includes("statsapi.mlb.com")) return jsonResponse({ dates: [{ games: [{ gamePk: 1, gameDate: "2026-08-10T00:00:00Z", gameType: "R", teams: { home: { team: { name: "Home" } }, away: { team: { name: "Away" } } }, status: { detailedState: "Scheduled" } }] }] })
    if (target.includes("baseballsavant.mlb.com")) return new Response("<!doctype html><title>Forbidden</title>", { status: 200 })
    return jsonResponse([])
  }

  const results = await validateProductionIntegrations({ redisClient, fetchImpl })
  const savant = results.find(result => result.service === "Baseball Savant")
  assert.equal(savant.success, false)
  assert.match(savant.error, /HTML instead of CSV/)
  delete process.env.ODDS_API_KEY
})
