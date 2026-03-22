import {
  buildHomePageProps,
  loadHomePageData
} from "../lib/homePageProps"

export async function getServerSideProps(context) {
  return buildHomePageProps(() => loadHomePageData(context.req))
}

function formatPercent(value) {
  return typeof value === "number"
    ? `${(value * 100).toFixed(1)}%`
    : "N/A"
}

function formatEdge(value) {
  return typeof value === "number"
    ? `${(value * 100).toFixed(1)}%`
    : "No edge"
}

function formatMoneyline(value) {
  if (typeof value !== "number") {
    return "N/A"
  }

  return value > 0 ? `+${value}` : `${value}`
}

function formatGameTime(value) {
  if (!value) {
    return "Time TBD"
  }

  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

function DashboardStat({ label, value, emphasis = false, tone = "default" }) {
  return (
    <div className={`stat stat--${tone} ${emphasis ? "stat--emphasis" : ""}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
    </div>
  )
}

export default function Home({ games, summary, error }) {
  const recommendationCount = summary?.recommendedBets ?? 0

  return (
    <main className="dashboard">
      <section className="hero">
        <div>
          <p className="eyebrow">MLB model dashboard</p>
          <h1>Today&apos;s betting board</h1>
          <p className="hero__copy">
            Scan projected winners, starting pitchers, and the strongest model edges
            in a card-based layout built for quick decision-making.
          </p>
        </div>

        <div className="hero__stats">
          <DashboardStat
            label="Games loaded"
            value={String(summary?.predictionsCreated ?? 0)}
            emphasis
          />
          <DashboardStat
            label="Recommended bets"
            value={String(recommendationCount)}
            tone={recommendationCount > 0 ? "success" : "muted"}
          />
          <DashboardStat
            label="Status"
            value={error ? "Cache unavailable" : (summary?.message || "Ready")}
            tone={error ? "danger" : "muted"}
          />
        </div>
      </section>

      {error && <p className="notice notice--error">Error loading cached predictions: {error}</p>}

      {!error && summary?.message && games.length === 0 && (
        <p className="notice">{summary.message}</p>
      )}

      {!error && games.length > 0 && (
        <section className="gamesGrid" aria-label="Model predictions dashboard">
          {games.map((game, index) => {
            const recommendedSide = game.recommendedBet || "No bet"
            const edgeTone = typeof game.edge === "number" ? "success" : "muted"

            return (
              <article
                className="gameCard"
                key={game.matchKey || game.gameId || `${game.homeTeam}-${game.awayTeam}-${index}`}
              >
                <div className="gameCard__header">
                  <div>
                    <p className="gameCard__meta">{formatGameTime(game.date)}</p>
                    <h2>
                      <span>{game.awayTeam}</span>
                      <span className="vs">@</span>
                      <span>{game.homeTeam}</span>
                    </h2>
                  </div>
                  <span className={`pill pill--${edgeTone}`}>
                    {typeof game.edge === "number" ? "Model edge" : "No edge"}
                  </span>
                </div>

                <div className="teams">
                  <div className="teamRow">
                    <div>
                      <p className="teamRow__label">Away</p>
                      <h3>{game.awayTeam}</h3>
                      <p className="teamRow__pitcher">SP: {game.awayPitcher || "TBD"}</p>
                    </div>
                    <div className="teamRow__probability">{formatPercent(game.awayWinProbability)}</div>
                  </div>

                  <div className="teamRow">
                    <div>
                      <p className="teamRow__label">Home</p>
                      <h3>{game.homeTeam}</h3>
                      <p className="teamRow__pitcher">SP: {game.homePitcher || "TBD"}</p>
                    </div>
                    <div className="teamRow__probability">{formatPercent(game.homeWinProbability)}</div>
                  </div>
                </div>

                <div className="cardMetrics">
                  <DashboardStat label="Model edge" value={formatEdge(game.edge)} emphasis tone={edgeTone} />
                  <DashboardStat label="Recommended bet" value={recommendedSide} tone={edgeTone} />
                  <DashboardStat label="Line" value={formatMoneyline(game.recommendedOdds)} />
                  <DashboardStat label="Sportsbook" value={game.sportsbook || "Awaiting odds"} />
                </div>
              </article>
            )
          })}
        </section>
      )}

      <style jsx>{`
        :global(body) {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top, rgba(59, 130, 246, 0.16), transparent 32%),
            linear-gradient(180deg, #0f172a 0%, #111827 100%);
          color: #e5eefb;
        }

        .dashboard {
          min-height: 100vh;
          padding: 48px 24px 64px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
          gap: 24px;
          align-items: start;
          margin-bottom: 32px;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #93c5fd;
          font-size: 0.78rem;
          font-weight: 700;
          margin: 0 0 12px;
        }

        h1 {
          margin: 0;
          font-size: clamp(2.25rem, 4vw, 3.5rem);
          line-height: 1;
        }

        .hero__copy {
          margin: 16px 0 0;
          max-width: 720px;
          color: #cbd5e1;
          font-size: 1.02rem;
          line-height: 1.7;
        }

        .hero__stats,
        .cardMetrics {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .hero__stats {
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 24px;
          padding: 20px;
          backdrop-filter: blur(18px);
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.32);
        }

        .stat {
          background: rgba(30, 41, 59, 0.72);
          border-radius: 18px;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat__label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
        }

        .stat__value {
          font-size: 1rem;
          line-height: 1.35;
          color: #f8fafc;
        }

        .stat--emphasis .stat__value {
          font-size: 1.75rem;
        }

        .stat--success {
          border-color: rgba(74, 222, 128, 0.35);
          background: rgba(20, 83, 45, 0.28);
        }

        .stat--danger {
          border-color: rgba(248, 113, 113, 0.3);
          background: rgba(127, 29, 29, 0.25);
        }

        .notice {
          margin: 0 0 20px;
          padding: 16px 18px;
          border-radius: 16px;
          background: rgba(30, 41, 59, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.16);
          color: #dbeafe;
        }

        .notice--error {
          background: rgba(127, 29, 29, 0.35);
          border-color: rgba(248, 113, 113, 0.36);
        }

        .gamesGrid {
          display: grid;
          gap: 20px;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }

        .gameCard {
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 24px;
          padding: 22px;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
          display: flex;
          flex-direction: column;
          gap: 20px;
          backdrop-filter: blur(14px);
        }

        .gameCard__header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .gameCard__meta {
          margin: 0 0 8px;
          color: #94a3b8;
          font-size: 0.9rem;
        }

        h2 {
          margin: 0;
          font-size: 1.35rem;
          line-height: 1.3;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .vs {
          color: #60a5fa;
          font-weight: 800;
        }

        .pill {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.8rem;
          font-weight: 700;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        .pill--success {
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
          border-color: rgba(74, 222, 128, 0.36);
        }

        .pill--muted {
          background: rgba(71, 85, 105, 0.34);
          color: #cbd5e1;
          border-color: rgba(148, 163, 184, 0.24);
        }

        .teams {
          display: grid;
          gap: 14px;
        }

        .teamRow {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          padding: 16px 18px;
          border-radius: 18px;
          background: rgba(30, 41, 59, 0.68);
          border: 1px solid rgba(148, 163, 184, 0.14);
        }

        .teamRow__label,
        .teamRow__pitcher {
          margin: 0;
        }

        .teamRow__label {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #93c5fd;
          margin-bottom: 6px;
        }

        h3 {
          margin: 0 0 4px;
          font-size: 1.08rem;
        }

        .teamRow__pitcher {
          color: #94a3b8;
          font-size: 0.92rem;
        }

        .teamRow__probability {
          font-size: 1.7rem;
          font-weight: 800;
          color: #f8fafc;
          text-align: right;
        }

        @media (max-width: 900px) {
          .hero {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .dashboard {
            padding: 32px 16px 48px;
          }

          .hero__stats,
          .cardMetrics {
            grid-template-columns: 1fr;
          }

          .gameCard__header,
          .teamRow {
            flex-direction: column;
            align-items: flex-start;
          }

          .teamRow__probability {
            text-align: left;
          }
        }
      `}</style>
    </main>
  )
}
