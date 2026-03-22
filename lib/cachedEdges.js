export async function getCachedEdges(redisClient) {
  const edges = await redisClient.get("mlb:edges:today")

  return Array.isArray(edges)
    ? edges.filter(Boolean)
    : []
}
