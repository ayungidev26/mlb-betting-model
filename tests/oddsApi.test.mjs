import test from "node:test"
import assert from "node:assert/strict"

import { buildOddsApiUrl, getOddsApiKey, redactOddsApiUrl } from "../lib/oddsApi.js"

test("getOddsApiKey throws when ODDS_API_KEY is not configured", () => {
  const originalApiKey = process.env.ODDS_API_KEY

  delete process.env.ODDS_API_KEY

  assert.throws(() => getOddsApiKey(), /ODDS_API_KEY environment variable is required/)

  if (originalApiKey === undefined) {
    delete process.env.ODDS_API_KEY
  } else {
    process.env.ODDS_API_KEY = originalApiKey
  }
})

test("buildOddsApiUrl includes the expected The Odds API query parameters", () => {
  const url = buildOddsApiUrl("example-secret")

  assert.equal(url.origin, "https://api.the-odds-api.com")
  assert.equal(url.pathname, "/v4/sports/baseball_mlb/odds/")
  assert.equal(url.searchParams.get("apiKey"), "example-secret")
  assert.equal(url.searchParams.get("regions"), "us")
  assert.equal(url.searchParams.get("markets"), "h2h")
  assert.equal(url.searchParams.get("oddsFormat"), "american")
})

test("redactOddsApiUrl removes the live apiKey value from logged URLs", () => {
  const redactedUrl = redactOddsApiUrl(buildOddsApiUrl("live-secret"))

  assert.match(redactedUrl, /apiKey=%5Bredacted%5D/)
  assert.doesNotMatch(redactedUrl, /live-secret/)
})
