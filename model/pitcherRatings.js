import { redis } from "../lib/upstash"

export async function getPitcherRating(name) {

  if (!name) return 0

  const stats = await redis.get("mlb:stats:pitchers")

  if (!stats || !stats[name]) return 0

  const pitcher = stats[name]

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
