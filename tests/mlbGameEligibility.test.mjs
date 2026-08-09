import test from "node:test"
import assert from "node:assert/strict"
import { classifyMlbGameType, isEligibleMlbGame } from "../lib/mlbGameEligibility.js"

function game(overrides = {}) {
  return {
    gameType: "R",
    teams: {
      home: { team: { id: 147, name: "New York Yankees" } },
      away: { team: { id: 111, name: "Boston Red Sox" } }
    },
    status: { codedGameState: "S", detailedState: "Scheduled" },
    ...overrides
  }
}

test("classifies regular, postseason, spring, and exhibition game types", () => {
  assert.equal(classifyMlbGameType("R"), "regular")
  assert.equal(classifyMlbGameType("W"), "playoffs")
  assert.equal(classifyMlbGameType("S"), "spring")
  assert.equal(classifyMlbGameType("E"), "exhibition")
})

test("accepts scheduled MLB regular games and excludes non-betting slates", () => {
  assert.equal(isEligibleMlbGame(game()).eligible, true)
  assert.equal(isEligibleMlbGame(game({ gameType: "S" })).reason, "game_type_S")
  assert.equal(isEligibleMlbGame(game({ teams: { home: { team: { id: 147, name: "New York Yankees" } }, away: { team: { id: 999, name: "College Team" } } } })).reason, "non_mlb_opponent")
  assert.equal(isEligibleMlbGame(game({ status: { codedGameState: "P", detailedState: "Postponed" } })).eligible, false)
})
