import Head from "next/head"
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

function getEdgeTier(edge) {
  if (typeof edge !== "number" || edge < 0.02) {
    return {
      tone: "danger",
      label: "No edge",
      recommendation: "Pass"
    }
  }

  if (edge > 0.05) {
    return {
      tone: "success",
      label: "Strong edge",
      recommendation: "Best bet"
    }
  }

  return {
    tone: "warning",
    label: "Moderate edge",
    recommendation: "Worth a look"
  }
}

function DashboardStat({ label, value, emphasis = false, tone = "default" }) {
  return (
    <div className={`stat stat--${tone} ${emphasis ? "stat--emphasis" : ""}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
    </div>
  )
}

function SectionHeading({ eyebrow, title, copy }) {
  return (
    <div className="sectionHeading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="sectionTitle">{title}</h2>
      </div>
      {copy && <p className="sectionHeading__copy">{copy}</p>}
    </div>
  )
}

export default function Home({ games, summary, error }) {
  const recommendationCount = summary?.recommendedBets ?? 0
  const topPlays = games.slice(0, Math.min(5, games.length))

  return (
    <>
      <Head>
        <title>MLB Model Dashboard</title>
        <meta
          name="description"
          content="Professional MLB betting dashboard with model projections, edges, and top plays."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <main className="dashboardShell">
        <div className="dashboardGlow dashboardGlow--primary" />
        <div className="dashboardGlow dashboardGlow--secondary" />

        <section className="dashboard">
          <section className="heroPanel">
            <div className="heroPanel__content">
              <p className="eyebrow">MLB model dashboard</p>
              <h1>Today&apos;s betting board</h1>
              <p className="hero__copy">
                Scan projected winners, starting pitchers, and the strongest model edges
                in a cleaner analytics layout designed for fast, confident reads.
              </p>

              <div className="heroHighlights" aria-label="Dashboard highlights">
                <div className="heroHighlight">
                  <span className="heroHighlight__label">Board coverage</span>
                  <strong className="heroHighlight__value">{summary?.predictionsCreated ?? 0} games tracked</strong>
                </div>
                <div className="heroHighlight">
                  <span className="heroHighlight__label">Model focus</span>
                  <strong className="heroHighlight__value">Top edges surfaced first</strong>
                </div>
              </div>
            </div>

            <div className="heroPanel__rail">
              <div className="heroPanel__stats">
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
                <DashboardStat
                  label="Top-play slots"
                  value={String(topPlays.length)}
                  tone={topPlays.length > 0 ? "warning" : "muted"}
                />
              </div>
            </div>
          </section>

          {error && <p className="notice notice--error">Error loading cached predictions: {error}</p>}

          {!error && summary?.message && games.length === 0 && (
            <p className="notice">{summary.message}</p>
          )}

          {!error && topPlays.length > 0 && (
            <section className="panel panel--feature topPlays" aria-label="Top Plays">
              <SectionHeading
                eyebrow="Best bets"
                title="Top Plays"
                copy="The highest-edge matchups stay pinned at the top so the strongest opportunities are visible at a glance."
              />

              <div className="topPlays__grid">
                {topPlays.map((game, index) => {
                  const edgeTier = getEdgeTier(game.edge)
                  const recommendedSide = game.recommendedBet || edgeTier.recommendation

                  return (
                    <article
                      className={`topPlayCard topPlayCard--${edgeTier.tone}`}
                      key={`top-play-${game.matchKey || game.gameId || `${game.homeTeam}-${game.awayTeam}-${index}`}`}
                    >
                      <div className="topPlayCard__rank">#{index + 1}</div>
                      <div className="topPlayCard__header">
                        <div>
                          <p className="gameCard__meta">{formatGameTime(game.date)}</p>
                          <h3 className="topPlayCard__teams">
                            <span>{game.awayTeam}</span>
                            <span className="vs">@</span>
                            <span>{game.homeTeam}</span>
                          </h3>
                        </div>
                        <span className={`pill pill--${edgeTier.tone}`}>
                          {edgeTier.label}
                        </span>
                      </div>

                      <div className="topPlayCard__stats">
                        <DashboardStat label="Edge" value={formatEdge(game.edge)} emphasis tone={edgeTier.tone} />
                        <DashboardStat label="Bet recommendation" value={recommendedSide} tone={edgeTier.tone} />
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {!error && games.length > 0 && (
            <section className="panel gamesPanel" aria-label="Model predictions dashboard">
              <SectionHeading
                eyebrow="Full card"
                title="All matchups"
                copy="Consistent spacing, cleaner hierarchy, and readable betting metrics across desktop and mobile."
              />

              <div className="gamesGrid">
                {games.map((game, index) => {
                  const edgeTier = getEdgeTier(game.edge)
                  const recommendedSide = game.recommendedBet || edgeTier.recommendation

                  return (
                    <article
                      className={`gameCard gameCard--${edgeTier.tone}`}
                      key={game.matchKey || game.gameId || `${game.homeTeam}-${game.awayTeam}-${index}`}
                    >
                      <div className="gameCard__header">
                        <div>
                          <p className="gameCard__meta">{formatGameTime(game.date)}</p>
                          <h2 className="gameCard__title">
                            <span>{game.awayTeam}</span>
                            <span className="vs">@</span>
                            <span>{game.homeTeam}</span>
                          </h2>
                        </div>
                        <span className={`pill pill--${edgeTier.tone}`}>
                          {edgeTier.label}
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
                        <DashboardStat label="Model edge" value={formatEdge(game.edge)} emphasis tone={edgeTier.tone} />
                        <DashboardStat label="Recommended bet" value={recommendedSide} tone={edgeTier.tone} />
                        <DashboardStat label="Line" value={formatMoneyline(game.recommendedOdds)} />
                        <DashboardStat label="Sportsbook" value={game.sportsbook || "Awaiting odds"} />
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </section>

        <style jsx>{`
          :global(html) {
            scroll-behavior: smooth;
          }

          :global(body) {
            margin: 0;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at top, rgba(59, 130, 246, 0.14), transparent 28%),
              linear-gradient(180deg, #08111f 0%, #0f172a 52%, #0b1120 100%);
            color: #e2e8f0;
          }

          :global(*) {
            box-sizing: border-box;
          }

          .dashboardShell {
            position: relative;
            min-height: 100vh;
            overflow: hidden;
          }

          .dashboardGlow {
            position: absolute;
            width: 34rem;
            height: 34rem;
            border-radius: 999px;
            filter: blur(90px);
            opacity: 0.28;
            pointer-events: none;
          }

          .dashboardGlow--primary {
            top: -10rem;
            right: -8rem;
            background: rgba(59, 130, 246, 0.45);
          }

          .dashboardGlow--secondary {
            left: -10rem;
            top: 40%;
            background: rgba(14, 165, 233, 0.18);
          }

          .dashboard {
            position: relative;
            z-index: 1;
            width: min(1280px, calc(100% - 32px));
            margin: 0 auto;
            padding: 36px 0 64px;
            display: grid;
            gap: 24px;
          }

          .panel,
          .heroPanel {
            background: rgba(8, 15, 29, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 28px;
            box-shadow: 0 24px 60px rgba(2, 6, 23, 0.34);
            backdrop-filter: blur(18px);
          }

          .heroPanel {
            padding: 32px;
            display: grid;
            grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.95fr);
            gap: 28px;
            align-items: stretch;
          }

          .heroPanel__content,
          .heroPanel__rail {
            display: flex;
            flex-direction: column;
          }

          .heroPanel__content {
            justify-content: center;
          }

          .heroPanel__stats {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            padding: 18px;
            height: 100%;
            border-radius: 24px;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.68));
            border: 1px solid rgba(148, 163, 184, 0.14);
          }

          .eyebrow {
            margin: 0 0 12px;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            color: #7dd3fc;
            font-size: 0.74rem;
            font-weight: 800;
          }

          h1 {
            margin: 0;
            max-width: 12ch;
            font-size: clamp(2.5rem, 4vw, 4.1rem);
            line-height: 0.98;
            letter-spacing: -0.04em;
            color: #f8fafc;
          }

          .hero__copy {
            margin: 18px 0 0;
            max-width: 60ch;
            color: #cbd5e1;
            font-size: 1.02rem;
            line-height: 1.8;
          }

          .heroHighlights {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-top: 28px;
          }

          .heroHighlight {
            padding: 18px 20px;
            border-radius: 20px;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(148, 163, 184, 0.12);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
          }

          .heroHighlight__label {
            display: block;
            margin-bottom: 8px;
            font-size: 0.76rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #94a3b8;
          }

          .heroHighlight__value {
            font-size: 1rem;
            line-height: 1.5;
            color: #f8fafc;
          }

          .sectionHeading {
            display: flex;
            justify-content: space-between;
            align-items: end;
            gap: 20px;
            margin-bottom: 22px;
          }

          .sectionTitle {
            margin: 0;
            font-size: clamp(1.55rem, 2.5vw, 2.2rem);
            letter-spacing: -0.03em;
            color: #f8fafc;
          }

          .sectionHeading__copy {
            margin: 0;
            max-width: 34rem;
            color: #94a3b8;
            font-size: 0.98rem;
            line-height: 1.75;
          }

          .stat,
          .teamRow,
          .topPlayCard,
          .gameCard {
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          }

          .stat {
            background: rgba(15, 23, 42, 0.76);
            border-radius: 18px;
            padding: 18px;
            border: 1px solid rgba(148, 163, 184, 0.12);
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 104px;
          }

          .stat__label {
            font-size: 0.74rem;
            text-transform: uppercase;
            letter-spacing: 0.11em;
            color: #94a3b8;
            font-weight: 700;
          }

          .stat__value {
            font-size: 1rem;
            line-height: 1.45;
            color: #f8fafc;
          }

          .stat--emphasis .stat__value {
            font-size: 1.9rem;
            letter-spacing: -0.03em;
          }

          .stat--success {
            border-color: rgba(74, 222, 128, 0.24);
            background: linear-gradient(180deg, rgba(20, 83, 45, 0.3), rgba(15, 23, 42, 0.82));
          }

          .stat--warning {
            border-color: rgba(250, 204, 21, 0.24);
            background: linear-gradient(180deg, rgba(120, 53, 15, 0.28), rgba(15, 23, 42, 0.82));
          }

          .stat--danger {
            border-color: rgba(248, 113, 113, 0.24);
            background: linear-gradient(180deg, rgba(127, 29, 29, 0.3), rgba(15, 23, 42, 0.82));
          }

          .stat--muted {
            background: rgba(15, 23, 42, 0.68);
          }

          .notice {
            margin: 0;
            padding: 16px 18px;
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.16);
            color: #dbeafe;
            line-height: 1.6;
          }

          .notice--error {
            background: rgba(127, 29, 29, 0.28);
            border-color: rgba(248, 113, 113, 0.3);
          }

          .panel {
            padding: 28px;
          }

          .panel--feature {
            background:
              linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(8, 15, 29, 0.86) 40%),
              rgba(8, 15, 29, 0.8);
            border-color: rgba(96, 165, 250, 0.2);
          }

          .topPlays__grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 18px;
          }

          .topPlayCard {
            position: relative;
            min-height: 230px;
            padding: 22px;
            border-radius: 24px;
            border: 1px solid rgba(148, 163, 184, 0.18);
            background: rgba(15, 23, 42, 0.84);
            display: flex;
            flex-direction: column;
            gap: 18px;
            overflow: hidden;
          }

          .topPlayCard::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 42%);
            pointer-events: none;
          }

          .topPlayCard--success {
            border-color: rgba(74, 222, 128, 0.26);
            background: linear-gradient(180deg, rgba(20, 83, 45, 0.26), rgba(15, 23, 42, 0.9) 28%);
          }

          .topPlayCard--warning {
            border-color: rgba(250, 204, 21, 0.26);
            background: linear-gradient(180deg, rgba(133, 77, 14, 0.26), rgba(15, 23, 42, 0.9) 28%);
          }

          .topPlayCard--danger {
            border-color: rgba(248, 113, 113, 0.22);
            background: linear-gradient(180deg, rgba(127, 29, 29, 0.24), rgba(15, 23, 42, 0.9) 28%);
          }

          .topPlayCard__rank {
            position: relative;
            z-index: 1;
            align-self: flex-start;
            padding: 7px 12px;
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.16);
            color: #e2e8f0;
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0.1em;
          }

          .topPlayCard__header,
          .gameCard__header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }

          .gameCard__meta {
            margin: 0 0 10px;
            color: #94a3b8;
            font-size: 0.9rem;
          }

          .topPlayCard__teams,
          .gameCard__title {
            margin: 0;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            line-height: 1.25;
            letter-spacing: -0.02em;
            color: #f8fafc;
          }

          .topPlayCard__teams {
            font-size: 1.45rem;
          }

          .gameCard__title {
            font-size: 1.32rem;
          }

          .vs {
            color: #38bdf8;
            font-weight: 800;
          }

          .topPlayCard__stats,
          .cardMetrics {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .topPlayCard__stats {
            margin-top: auto;
          }

          .gamesGrid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
          }

          .gameCard {
            padding: 22px;
            border-radius: 24px;
            border: 1px solid rgba(148, 163, 184, 0.16);
            background: rgba(15, 23, 42, 0.78);
            display: flex;
            flex-direction: column;
            gap: 20px;
            transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          }

          .gameCard:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 40px rgba(2, 6, 23, 0.32);
          }

          .gameCard--success {
            border-color: rgba(74, 222, 128, 0.24);
            background: linear-gradient(180deg, rgba(22, 101, 52, 0.14), rgba(15, 23, 42, 0.82) 18%);
          }

          .gameCard--warning {
            border-color: rgba(250, 204, 21, 0.24);
            background: linear-gradient(180deg, rgba(161, 98, 7, 0.14), rgba(15, 23, 42, 0.82) 18%);
          }

          .gameCard--danger {
            border-color: rgba(248, 113, 113, 0.22);
            background: linear-gradient(180deg, rgba(127, 29, 29, 0.14), rgba(15, 23, 42, 0.82) 18%);
          }

          .pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 8px 12px;
            white-space: nowrap;
            font-size: 0.78rem;
            font-weight: 700;
            border: 1px solid transparent;
          }

          .pill--success {
            background: rgba(34, 197, 94, 0.14);
            color: #86efac;
            border-color: rgba(74, 222, 128, 0.26);
          }

          .pill--warning {
            background: rgba(250, 204, 21, 0.13);
            color: #fde68a;
            border-color: rgba(250, 204, 21, 0.24);
          }

          .pill--danger {
            background: rgba(248, 113, 113, 0.12);
            color: #fca5a5;
            border-color: rgba(248, 113, 113, 0.22);
          }

          .pill--muted {
            background: rgba(71, 85, 105, 0.28);
            color: #cbd5e1;
            border-color: rgba(148, 163, 184, 0.2);
          }

          .teams {
            display: grid;
            gap: 14px;
          }

          .teamRow {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding: 16px 18px;
            border-radius: 20px;
            background: rgba(15, 23, 42, 0.54);
            border: 1px solid rgba(148, 163, 184, 0.12);
          }

          .teamRow__label,
          .teamRow__pitcher {
            margin: 0;
          }

          .teamRow__label {
            margin-bottom: 6px;
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #7dd3fc;
            font-weight: 700;
          }

          h3 {
            margin: 0 0 4px;
            font-size: 1.08rem;
            color: #f8fafc;
          }

          .teamRow__pitcher {
            color: #94a3b8;
            font-size: 0.92rem;
          }

          .teamRow__probability {
            font-size: clamp(1.45rem, 2vw, 1.8rem);
            font-weight: 800;
            color: #f8fafc;
            letter-spacing: -0.03em;
            text-align: right;
          }

          @media (max-width: 980px) {
            .heroPanel {
              grid-template-columns: 1fr;
            }

            .sectionHeading {
              align-items: flex-start;
              flex-direction: column;
            }

            .sectionHeading__copy {
              max-width: none;
            }
          }

          @media (max-width: 720px) {
            .dashboard {
              width: min(100% - 24px, 1280px);
              padding: 20px 0 44px;
              gap: 18px;
            }

            .heroPanel,
            .panel {
              padding: 20px;
              border-radius: 24px;
            }

            .heroHighlights,
            .heroPanel__stats,
            .topPlayCard__stats,
            .cardMetrics {
              grid-template-columns: 1fr;
            }

            .gamesGrid,
            .topPlays__grid {
              grid-template-columns: 1fr;
            }

            .topPlayCard__header,
            .gameCard__header,
            .teamRow {
              flex-direction: column;
              align-items: flex-start;
            }

            .teamRow__probability {
              text-align: left;
            }

            h1 {
              max-width: none;
            }
          }
        `}</style>
      </main>
    </>
  )
}
