import { redis } from "../lib/upstash.js"

export async function getPitcherStats(stats = null) {

  if (stats) return stats

  return await redis.get("mlb:stats:pitchers")

}

export async function getPitcherRating(name, stats = null) {

  if (!name) return 0

  const pitcherStats = await getPitcherStats(stats)

  if (!pitcherStats || !pitcherStats[name]) return 0

  const pitcher = pitcherStats[name]

  let rating = 0

  // ERA component
  if (pitcher.era < 3) rating += 70
  else if (pitcher.era < 3.5) rating += 50
  else if (pitcher.era < 4) rating += 30

  // WHIP component
  if (pitcher.whip < 1.05) rating += 40
  else if (pitcher.whip < 1.2) rating += 20

  // Strikeout strength
  const kRate = pitcher.strikeouts / pitcher.innings

  if (kRate > 1.2) rating += 30
  else if (kRate > 1) rating += 15

  return rating
}
