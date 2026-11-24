import test from "node:test"
import assert from "node:assert/strict"
import { collectHistoricalFinals, compareHistoricalFinals, historicalDate, prepareHistoricalEvaluation } from "../lib/historicalGames.js"
import { evaluatePredictions } from "../lib/evaluation.js"
import { loadDashboardSlate } from "../lib/dashboardSlate.js"

const officialDate = "2026-10-28"
const day = { date: officialDate }
const teams = {
  home: { team: { name: "Tampa Bay Rays" }, score: 5 },
  away: { team: { name: "Milwaukee Brewers" }, score: 2 }
}
const final = {
  gamePk: 849799, officialDate, gameDate: "2026-10-29T00:10:00Z",
  gameType: "W", status: { detailedState: "Final" }, teams
}

test("collects unique completed MLB games using official dates and valid scores", () => {
  const schedule = { dates: [{ ...day, games: [
    final, final,
    { ...final, gamePk: 2, gameDate: "2026-10-28T18:00:00Z", status: { detailedState: "Completed Early" } },
    { ...final, gamePk: 3, gameType: "E" },
    { ...final, gamePk: 4, teams: { ...teams, away: { ...teams.away, score: null } } }
  ] }, {
    date: "2026-10-29",
    games: [{ ...final, gameDate: "2026-10-29T19:00:00Z" }]
  }] }
  const finals = collectHistoricalFinals(schedule, 2026)

  assert.deepEqual(finals.map(game => game.gamePk), [2, 849799])
  assert.equal(historicalDate(finals[1]), officialDate)
  const { gamePk, matchKey, ...stored } = finals[1]
  assert.equal(gamePk, 849799)
  assert.equal(matchKey, "v2|mlb|849799")
  const comparison = compareHistoricalFinals([
    stored,
    { ...stored, date: "2026-10-29T19:00:00Z" }
  ], finals, 2026, schedule)
  assert.deepEqual(comparison.added, [{ gamePk: 2, officialDate }])
  assert.deepEqual(comparison.missingFromSource, [])
  assert.equal(finals[1].date, final.gameDate)
})

test("matches October night games by MLB ID and leaves legacy doubleheaders unmatched", () => {
  const finals = collectHistoricalFinals({ dates: [{ ...day, games: [
    final, { ...final, gamePk: 849800, gameDate: "2026-10-28T19:10:00Z" }
  ] }] }, 2026)
  const prediction = { homeWinProbability: 0.62, awayWinProbability: 0.38 }
  const prepared = prepareHistoricalEvaluation([
    { ...prediction, gameId: 849799 },
    { ...prediction, matchKey: "2026-10-28|Milwaukee Brewers|Tampa Bay Rays" }
  ], finals)
  const output = evaluatePredictions(prepared.predictions, prepared.finals)

  assert.equal(output.metrics.gamesPredicted, 2)
  assert.equal(output.metrics.gamesMatchedToFinal, 1)
})

test("offseason dashboard requires a confirmed current slate and uses the latest completed season", async () => {
  const closeout = { season: 2026, finalGames: 2467 }
  const keys = new Map([
    ["mlb:games:today", []],
    ["mlb:games:today:meta", { dateKey: "2027-01-01", gamesToday: 0 }],
    ["mlb:seasonSummary:2026", closeout]
  ])
  const redis = { get: async (key) => keys.get(key) }
  const calendar = async () => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ seasons: [{ seasonId: "2027", seasonStartDate: "2027-02-19", regularSeasonStartDate: "2027-03-24" }] })
  })
  assert.deepEqual((await loadDashboardSlate(redis, "2027-01-02", calendar)).slate, { status: "unavailable" })
  assert.deepEqual((await loadDashboardSlate(redis, "2027-01-01", calendar)).slate, {
    status: "offseason", season: 2026, closeout, nextRegularSeasonDate: "2027-03-24"
  })
})
