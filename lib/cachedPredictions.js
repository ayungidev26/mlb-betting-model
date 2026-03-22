export async function getCachedPredictions(redisClient) {
  const predictions = await redisClient.get("mlb:predictions:today")

  return Array.isArray(predictions)
    ? predictions.filter(Boolean)
    : []
}
