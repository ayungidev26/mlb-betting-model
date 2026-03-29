import test from "node:test"
import assert from "node:assert/strict"

process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.test"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"

const { getPitcherRatingDetails } = await import("../model/pitcherRatings.js")

test("pitcher lookup uses explicit pitcherId when duplicate names exist", async () => {
  const pitcherStats = {
    version: "v3",
    byId: {
      "12345": {
        pitcherId: 12345,
        fullName: "Luis Garcia",
        teamName: "Houston Astros",
        era: 3.2,
        whip: 1.12,
        innings: 100
      },
      "67890": {
        pitcherId: 67890,
        fullName: "Luis Garcia",
        teamName: "Washington Nationals",
        era: 4.8,
        whip: 1.44,
        innings: 80
      }
    },
    aliasMap: {
      "Luis Garcia": [12345, 67890]
    }
  }

  const details = await getPitcherRatingDetails({
    name: "Luis Garcia",
    pitcherId: 67890,
    team: "Washington Nationals"
  }, pitcherStats)

  assert.equal(details.pitcherId, 67890)
  assert.equal(details.stats?.era, 4.8)
})

test("pitcher lookup resolves duplicate names via team context when pitcherId is missing", async () => {
  const pitcherStats = {
    version: "v3",
    byId: {
      "12345": {
        pitcherId: 12345,
        fullName: "Luis Garcia",
        teamName: "Houston Astros",
        era: 3.2,
        whip: 1.12,
        innings: 100
      },
      "67890": {
        pitcherId: 67890,
        fullName: "Luis Garcia",
        teamName: "Washington Nationals",
        era: 4.8,
        whip: 1.44,
        innings: 80
      }
    },
    aliasMap: {
      "Luis Garcia": [12345, 67890]
    }
  }

  const details = await getPitcherRatingDetails({
    name: "Luis Garcia",
    team: "Houston Astros"
  }, pitcherStats)

  assert.equal(details.pitcherId, 12345)
  assert.equal(details.stats?.era, 3.2)
})
