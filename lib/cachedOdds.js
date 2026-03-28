export async function getCachedOdds(redisClient) {
  const odds = await redisClient.get("mlb:odds:today")

  return Array.isArray(odds)
    ? odds.filter(Boolean)
    : []
}
