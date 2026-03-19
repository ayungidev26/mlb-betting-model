import { useEffect, useState } from "react"

export default function Home() {
  const [games, setGames] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPredictions() {
      try {
        const response = await fetch("/api/runModel")
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to load predictions")
        }

        const sampleGames = Array.isArray(data.sample) ? data.sample : []

        setSummary({
          predictionsCreated: data.predictionsCreated ?? sampleGames.length,
          message: data.message || ""
        })
        setGames(sampleGames)
      } catch (err) {
        setError(err.message || "Failed to load predictions")
      } finally {
        setLoading(false)
      }
    }

    loadPredictions()
  }, [])

  return (
    <main>
      <h1>MLB Betting Model</h1>

      {loading && <p>Loading predictions...</p>}

      {!loading && error && <p>Error: {error}</p>}

      {!loading && !error && summary?.message && <p>{summary.message}</p>}

      {!loading && !error && !summary?.message && (
        <p>
          Showing {games.length} sample prediction
          {games.length === 1 ? "" : "s"}
          {typeof summary?.predictionsCreated === "number"
            ? ` from ${summary.predictionsCreated} generated`
            : ""}
          .
        </p>
      )}

      {!loading && !error && games.map((game, index) => (
        <section
          key={game.matchKey || game.gameId || `${game.homeTeam}-${game.awayTeam}-${index}`}
        >
          <h2>
            {game.awayTeam} at {game.homeTeam}
          </h2>
          <p>Game ID: {game.gameId ?? "N/A"}</p>
          <p>Matchup key: {game.matchKey ?? "N/A"}</p>
          <p>Date: {game.date ? new Date(game.date).toLocaleString() : "N/A"}</p>
          <p>
            Home win probability: {typeof game.homeWinProbability === "number"
              ? `${(game.homeWinProbability * 100).toFixed(1)}%`
              : "N/A"}
          </p>
          <p>
            Away win probability: {typeof game.awayWinProbability === "number"
              ? `${(game.awayWinProbability * 100).toFixed(1)}%`
              : "N/A"}
          </p>
        </section>
      ))}
    </main>
  )
}
