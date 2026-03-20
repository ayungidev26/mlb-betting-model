import { buildHomePageProps } from "../lib/homePageProps"
import { redis } from "../lib/upstash"

export async function getServerSideProps() {
  return buildHomePageProps(() => redis.get("mlb:predictions:today"))
}

export default function Home({ games, summary, error }) {
  return (
    <main>
      <h1>MLB Betting Model</h1>

      {error && <p>Error loading cached predictions: {error}</p>}

      {!error && summary?.message && <p>{summary.message}</p>}

      {!error && !summary?.message && (
        <p>
          Showing {games.length} cached prediction
          {games.length === 1 ? "" : "s"}
          {typeof summary?.predictionsCreated === "number"
            ? ` from ${summary.predictionsCreated} available`
            : ""}
          .
        </p>
      )}

      {!error && games.map((game, index) => (
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
