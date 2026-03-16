import { getTodayGames } from "./getTodayGames"
import { findEdges } from "./findEdges"
import { storePrediction } from "./storePrediction"

export async function runModel() {

  const games = await getTodayGames()

  const edges = await findEdges(games)

  for (const edge of edges) {
    await storePrediction(edge)
  }

  return {
    gamesAnalyzed: games.length,
    edgesFound: edges.length
  }
}
