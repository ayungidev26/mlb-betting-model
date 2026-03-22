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

function formatMetricValue(value, digits = 2) {
  return typeof value === "number"
    ? value.toFixed(digits)
    : "N/A"
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

function probabilityToMoneyline(probability) {
  if (typeof probability !== "number" || probability <= 0 || probability >= 1) {
    return null
  }

  if (probability >= 0.5) {
    return Math.round((-probability / (1 - probability)) * 100)
  }

  return Math.round(((1 - probability) / probability) * 100)
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

function getPitcherStatLine(stats) {
  if (!stats) {
    return "ERA N/A • FIP N/A • xERA N/A"
  }

  return [
    `ERA ${formatMetricValue(stats.era)}`,
    `FIP ${formatMetricValue(stats.fip)}`,
    `xERA ${formatMetricValue(stats.xera)}`
  ].join(" • ")
}

function getBullpenLabel(rating) {
  if (typeof rating !== "number") {
    return "No bullpen read"
  }

  if (rating >= 100) {
    return "Elite bullpen"
  }

  if (rating >= 80) {
    return "Above-average bullpen"
  }

  if (rating >= 60) {
    return "Stable bullpen"
  }

  if (rating >= 40) {
    return "Mixed bullpen form"
  }

  return "Volatile bullpen"
}

function getBullpenSummary(details) {
  if (!details?.stats && typeof details?.rating !== "number") {
    return "Bullpen data pending"
  }

  const stats = details?.stats || {}
  const rating = typeof details?.rating === "number"
    ? Math.round(details.rating)
    : null

  return [
    rating !== null ? `${getBullpenLabel(details.rating)} (${rating})` : getBullpenLabel(details?.rating),
    `ERA ${formatMetricValue(stats.era)}`,
    `FIP ${formatMetricValue(stats.fip)}`
  ].join(" • ")
}

function getRecommendedSideProbability(game) {
  if (!game?.recommendedBet) {
    return null
  }

  if (game.recommendedBet === game.homeTeam) {
    return game.homeWinProbability
  }

  if (game.recommendedBet === game.awayTeam) {
    return game.awayWinProbability
  }

  return null
}

function getOddsComparison(game) {
  const modelProbability = getRecommendedSideProbability(game)
  const modelOdds = probabilityToMoneyline(modelProbability)

  return {
    bookOdds: typeof game?.recommendedOdds === "number"
      ? formatMoneyline(game.recommendedOdds)
      : "N/A",
    modelOdds: modelOdds !== null
      ? formatMoneyline(modelOdds)
      : "N/A"
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

function PitcherPanel({ side, team, pitcher, probability, details }) {
  return (
    <div className="pitcherPanel">
      <div className="pitcherPanel__header">
        <div>
          <p className="teamRow__label">{side}</p>
          <h3>{team}</h3>
        </div>
        <div className="teamRow__probability">{formatPercent(probability)}</div>
      </div>

      <p className="pitcherPanel__name">{pitcher || "TBD"}</p>
      <p className="pitcherPanel__stats">{getPitcherStatLine(details?.stats)}</p>
    </div>
  )
}

export default function Home({ games, summary, error }) {
  const recommendationCount = summary?.recommendedBets ?? 0
  const topPlays = games.slice(0, Math.min(5, games.length))

  return (
    <main className="dashboard">
      <section className="hero">
        <div>
          <p className="eyebrow">MLB model dashboard</p>
          <h1>Today&apos;s betting board</h1>
          <p className="hero__copy">
            Scan projected winners, starters, bullpen context, and pricing gaps
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

      {!error && topPlays.length > 0 && (
        <section className="topPlays" aria-label="Top Plays">
          <div className="topPlays__header">
            <div>
              <p className="eyebrow topPlays__eyebrow">Best bets</p>
              <h2 className="sectionTitle">Top Plays</h2>
            </div>
            <p className="topPlays__copy">
              The highest-edge matchups are pinned here first so the strongest plays
              stand out immediately.
            </p>
          </div>

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
        <section className="gamesGrid" aria-label="Model predictions dashboard">
          {games.map((game, index) => {
            const edgeTier = getEdgeTier(game.edge)
            const recommendedSide = game.recommendedBet || edgeTier.recommendation
            const awayPitcherDetails = game.pitcherModel?.away || null
            const homePitcherDetails = game.pitcherModel?.home || null
            const awayBullpenDetails = game.bullpenModel?.away || null
            const homeBullpenDetails = game.bullpenModel?.home || null
            const oddsComparison = getOddsComparison(game)

            return (
              <article
                className={`gameCard gameCard--${edgeTier.tone}`}
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
                  <span className={`pill pill--${edgeTier.tone}`}>
                    {edgeTier.label}
                  </span>
                </div>

                <div className="gameCard__body">
                  <section className="gameCard__column gameCard__column--matchup" aria-label="Matchup overview">
                    <div className="gameCard__sectionHeader">
                      <span className="sectionKicker">Matchup</span>
                      <span className="gameCard__subtle">Left side snapshot</span>
                    </div>

                    <PitcherPanel
                      side="Away"
                      team={game.awayTeam}
                      pitcher={game.awayPitcher}
                      probability={game.awayWinProbability}
                      details={awayPitcherDetails}
                    />

                    <PitcherPanel
                      side="Home"
                      team={game.homeTeam}
                      pitcher={game.homePitcher}
                      probability={game.homeWinProbability}
                      details={homePitcherDetails}
                    />
                  </section>

                  <section className="gameCard__column gameCard__column--analytics" aria-label="Pitching and bullpen context">
                    <div className="gameCard__sectionHeader">
                      <span className="sectionKicker">Pitching context</span>
                      <span className="gameCard__subtle">Starter and bullpen read</span>
                    </div>

                    <div className="analyticsBlock">
                      <div className="analyticsBlock__row">
                        <span className="analyticsBlock__team">{game.awayTeam}</span>
                        <span className="analyticsBlock__text">{getPitcherStatLine(awayPitcherDetails?.stats)}</span>
                      </div>
                      <div className="analyticsBlock__row">
                        <span className="analyticsBlock__team">{game.homeTeam}</span>
                        <span className="analyticsBlock__text">{getPitcherStatLine(homePitcherDetails?.stats)}</span>
                      </div>
                    </div>

                    <div className="analyticsBlock analyticsBlock--bullpen">
                      <div className="analyticsBlock__row analyticsBlock__row--stacked">
                        <span className="analyticsBlock__team">{game.awayTeam} bullpen</span>
                        <span className="analyticsBlock__text">{getBullpenSummary(awayBullpenDetails)}</span>
                      </div>
                      <div className="analyticsBlock__row analyticsBlock__row--stacked">
                        <span className="analyticsBlock__team">{game.homeTeam} bullpen</span>
                        <span className="analyticsBlock__text">{getBullpenSummary(homeBullpenDetails)}</span>
                      </div>
                    </div>
                  </section>

                  <section className="gameCard__column gameCard__column--edge" aria-label="Betting edge and recommendation">
                    <div className="gameCard__sectionHeader">
                      <span className="sectionKicker">Edge</span>
                      <span className="gameCard__subtle">Recommendation summary</span>
                    </div>

                    <div className="recommendationCard">
                      <p className="recommendationCard__label">Recommended side</p>
                      <h3 className="recommendationCard__team">{recommendedSide}</h3>
                      <p className="recommendationCard__supporting">
                        {game.sportsbook ? `Best book: ${game.sportsbook}` : "Sportsbook line pending"}
                      </p>
                    </div>

                    <div className="cardMetrics">
                      <DashboardStat label="Model edge" value={formatEdge(game.edge)} emphasis tone={edgeTier.tone} />
                      <DashboardStat label="Book odds" value={oddsComparison.bookOdds} tone={edgeTier.tone} />
                      <DashboardStat label="Model fair odds" value={oddsComparison.modelOdds} tone="muted" />
                      <DashboardStat label="Recommendation" value={game.recommendation || recommendedSide} tone={edgeTier.tone} />
                    </div>
                  </section>
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
          max-width: 1360px;
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
          min-height: 88px;
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

        .stat--warning {
          border-color: rgba(250, 204, 21, 0.35);
          background: rgba(113, 63, 18, 0.26);
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

        .topPlays {
          margin-bottom: 28px;
          padding: 24px;
          border-radius: 28px;
          border: 1px solid rgba(96, 165, 250, 0.28);
          background:
            linear-gradient(135deg, rgba(30, 64, 175, 0.3), rgba(15, 23, 42, 0.92) 45%),
            rgba(15, 23, 42, 0.9);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.34);
        }

        .topPlays__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin-bottom: 20px;
        }

        .topPlays__eyebrow {
          margin-bottom: 10px;
        }

        .sectionTitle {
          margin: 0;
          font-size: clamp(1.7rem, 3vw, 2.4rem);
        }

        .topPlays__copy {
          margin: 0;
          max-width: 420px;
          color: #cbd5e1;
          line-height: 1.7;
        }

        .topPlays__grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }

        .topPlayCard {
          position: relative;
          overflow: hidden;
          min-height: 220px;
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.88);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 36px rgba(2, 6, 23, 0.34);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .topPlayCard::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 40%);
          pointer-events: none;
        }

        .topPlayCard--success {
          border-color: rgba(74, 222, 128, 0.36);
          background: linear-gradient(180deg, rgba(20, 83, 45, 0.32), rgba(15, 23, 42, 0.92) 24%);
        }

        .topPlayCard--warning {
          border-color: rgba(250, 204, 21, 0.32);
          background: linear-gradient(180deg, rgba(133, 77, 14, 0.34), rgba(15, 23, 42, 0.92) 24%);
        }

        .topPlayCard--danger {
          border-color: rgba(248, 113, 113, 0.3);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.32), rgba(15, 23, 42, 0.92) 24%);
        }

        .topPlayCard__rank {
          align-self: flex-start;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(191, 219, 254, 0.16);
          border: 1px solid rgba(191, 219, 254, 0.18);
          color: #dbeafe;
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .topPlayCard__header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .topPlayCard__teams {
          margin: 0;
          font-size: 1.5rem;
          line-height: 1.3;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .topPlayCard__stats {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: auto;
        }

        .gamesGrid {
          display: grid;
          gap: 20px;
          grid-template-columns: 1fr;
        }

        .gameCard {
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-left-width: 4px;
          border-radius: 24px;
          padding: 22px;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
          display: flex;
          flex-direction: column;
          gap: 20px;
          backdrop-filter: blur(14px);
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .gameCard--success {
          border-color: rgba(74, 222, 128, 0.34);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(74, 222, 128, 0.08);
          background: linear-gradient(180deg, rgba(22, 101, 52, 0.15), rgba(15, 23, 42, 0.78) 18%);
        }

        .gameCard--warning {
          border-color: rgba(250, 204, 21, 0.34);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(250, 204, 21, 0.08);
          background: linear-gradient(180deg, rgba(161, 98, 7, 0.14), rgba(15, 23, 42, 0.78) 18%);
        }

        .gameCard--danger {
          border-color: rgba(248, 113, 113, 0.3);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(248, 113, 113, 0.06);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.14), rgba(15, 23, 42, 0.78) 18%);
        }

        .gameCard__header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .gameCard__body {
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.25fr) minmax(300px, 0.9fr);
          align-items: stretch;
        }

        .gameCard__column {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .gameCard__column--analytics,
        .gameCard__column--edge {
          padding-left: 18px;
          border-left: 1px solid rgba(148, 163, 184, 0.12);
        }

        .gameCard__sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
        }

        .sectionKicker {
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.72rem;
          font-weight: 800;
          color: #93c5fd;
        }

        .gameCard__subtle {
          color: #64748b;
          font-size: 0.84rem;
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

        .pill--warning {
          background: rgba(250, 204, 21, 0.16);
          color: #fde68a;
          border-color: rgba(250, 204, 21, 0.3);
        }

        .pill--danger {
          background: rgba(248, 113, 113, 0.14);
          color: #fca5a5;
          border-color: rgba(248, 113, 113, 0.3);
        }

        .pill--muted {
          background: rgba(71, 85, 105, 0.34);
          color: #cbd5e1;
          border-color: rgba(148, 163, 184, 0.24);
        }

        .pitcherPanel,
        .analyticsBlock,
        .recommendationCard {
          padding: 16px 18px;
          border-radius: 18px;
          background: rgba(30, 41, 59, 0.68);
          border: 1px solid rgba(148, 163, 184, 0.14);
        }

        .pitcherPanel {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pitcherPanel__header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
        }

        .teamRow__label {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #93c5fd;
          margin: 0 0 6px;
        }

        h3 {
          margin: 0;
          font-size: 1.08rem;
        }

        .pitcherPanel__name {
          margin: 0;
          color: #f8fafc;
          font-weight: 700;
        }

        .pitcherPanel__stats,
        .analyticsBlock__text,
        .recommendationCard__supporting {
          margin: 0;
          color: #94a3b8;
          font-size: 0.92rem;
          line-height: 1.55;
        }

        .teamRow__probability {
          font-size: 1.35rem;
          font-weight: 800;
          color: #f8fafc;
          text-align: right;
          white-space: nowrap;
        }

        .analyticsBlock {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .analyticsBlock__row {
          display: grid;
          grid-template-columns: minmax(120px, auto) minmax(0, 1fr);
          gap: 14px;
          align-items: baseline;
        }

        .analyticsBlock__row--stacked {
          grid-template-columns: 1fr;
        }

        .analyticsBlock__team {
          color: #e2e8f0;
          font-weight: 700;
        }

        .analyticsBlock--bullpen {
          background: rgba(15, 23, 42, 0.56);
        }

        .recommendationCard {
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(30, 41, 59, 0.78));
        }

        .recommendationCard__label {
          margin: 0 0 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.72rem;
          color: #93c5fd;
        }

        .recommendationCard__team {
          margin: 0 0 6px;
          font-size: 1.35rem;
        }

        @media (max-width: 1100px) {
          .gameCard__body {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .gameCard__column--edge {
            grid-column: 1 / -1;
          }

          .gameCard__column--edge,
          .gameCard__column--analytics {
            padding-left: 0;
            border-left: 0;
          }

          .gameCard__column--edge {
            padding-top: 4px;
            border-top: 1px solid rgba(148, 163, 184, 0.12);
          }
        }

        @media (max-width: 900px) {
          .hero {
            grid-template-columns: 1fr;
          }

          .topPlays__header {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 760px) {
          .gameCard__body {
            grid-template-columns: 1fr;
          }

          .gameCard__column--analytics,
          .gameCard__column--edge {
            padding-left: 0;
            border-left: 0;
          }

          .gameCard__column--analytics,
          .gameCard__column--edge {
            padding-top: 4px;
            border-top: 1px solid rgba(148, 163, 184, 0.12);
          }

          .gameCard__sectionHeader,
          .pitcherPanel__header,
          .analyticsBlock__row,
          .gameCard__header,
          .topPlayCard__header {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: flex-start;
          }

          .analyticsBlock__row {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .teamRow__probability {
            text-align: left;
          }
        }

        @media (max-width: 640px) {
          .dashboard {
            padding: 32px 16px 48px;
          }

          .hero__stats,
          .cardMetrics,
          .topPlayCard__stats {
            grid-template-columns: 1fr;
          }

          .topPlays {
            padding: 20px;
          }
        }
      `}</style>
    </main>
  )
}
