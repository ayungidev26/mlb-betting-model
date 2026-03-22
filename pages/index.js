import { useEffect, useMemo, useState } from "react"

import {
  buildHomePageProps,
  buildHomePageViewModel,
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

function LoadingSkeleton({ count = 3 }) {
  return (
    <section className="gamesGrid" aria-label="Loading predictions">
      {Array.from({ length: count }, (_, index) => (
        <article className="gameCard gameCard--loading" key={`loading-${index}`} aria-hidden="true">
          <div className="gameCard__header">
            <div className="skeletonBlock skeletonBlock--title" />
            <div className="skeletonPill" />
          </div>

          <div className="gameCard__body">
            {Array.from({ length: 3 }, (_, columnIndex) => (
              <section className="gameCard__column" key={`loading-column-${columnIndex}`}>
                <div className="skeletonBlock skeletonBlock--label" />
                <div className="skeletonPanel">
                  <div className="skeletonBlock skeletonBlock--lineShort" />
                  <div className="skeletonBlock skeletonBlock--line" />
                  <div className="skeletonBlock skeletonBlock--lineMuted" />
                </div>
                <div className="skeletonPanel">
                  <div className="skeletonBlock skeletonBlock--lineShort" />
                  <div className="skeletonBlock skeletonBlock--line" />
                  <div className="skeletonBlock skeletonBlock--lineMuted" />
                </div>
              </section>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}

function EmptyState({ message, isRefreshing }) {
  return (
    <section className="emptyState" aria-live="polite">
      <div className="emptyState__icon" aria-hidden="true">⚾</div>
      <p className="eyebrow emptyState__eyebrow">No predictions yet</p>
      <h2 className="emptyState__title">We&apos;re waiting for the latest board to populate.</h2>
      <p className="emptyState__copy">
        {message || "Predictions will appear here as soon as the cache is refreshed with today&apos;s games."}
      </p>
      <div className="emptyState__actions">
        <span className="pill pill--muted">
          {isRefreshing ? "Checking for fresh predictions..." : "No action needed — we&apos;ll keep trying."}
        </span>
      </div>
    </section>
  )
}

async function fetchHomePageData() {
  const [predictionsResponse, edgesResponse] = await Promise.all([
    fetch("/api/predictions"),
    fetch("/api/edges")
  ])

  if (!predictionsResponse.ok || !edgesResponse.ok) {
    throw new Error("Cached predictions are currently unavailable.")
  }

  const [predictionsPayload, edgesPayload] = await Promise.all([
    predictionsResponse.json(),
    edgesResponse.json()
  ])

  return buildHomePageViewModel({
    predictions: predictionsPayload?.predictions,
    edges: edgesPayload?.edges
  })
}

export default function Home({ games = [], summary, error = "" }) {
  const initialViewModel = useMemo(() => ({
    games: Array.isArray(games) ? games : [],
    summary: summary || {
      predictionsCreated: 0,
      recommendedBets: 0,
      message: "No cached predictions are available yet."
    }
  }), [games, summary])

  const [viewModel, setViewModel] = useState(initialViewModel)
  const [fetchState, setFetchState] = useState({
    isLoading: initialViewModel.games.length === 0 && !error,
    isRefreshing: false,
    error: error || ""
  })

  useEffect(() => {
    let isActive = true

    setViewModel(initialViewModel)
    setFetchState({
      isLoading: initialViewModel.games.length === 0 && !error,
      isRefreshing: initialViewModel.games.length > 0,
      error: error || ""
    })

    fetchHomePageData()
      .then((nextViewModel) => {
        if (!isActive) {
          return
        }

        setViewModel(nextViewModel)
        setFetchState({
          isLoading: false,
          isRefreshing: false,
          error: ""
        })
      })
      .catch((fetchError) => {
        if (!isActive) {
          return
        }

        setFetchState({
          isLoading: false,
          isRefreshing: false,
          error: fetchError instanceof Error
            ? fetchError.message
            : "Cached predictions are currently unavailable."
        })
      })

    return () => {
      isActive = false
    }
  }, [initialViewModel, error])

  const activeGames = Array.isArray(viewModel.games) ? viewModel.games : []
  const activeSummary = viewModel.summary || initialViewModel.summary
  const recommendationCount = activeSummary?.recommendedBets ?? 0
  const topPlays = activeGames.slice(0, Math.min(5, activeGames.length))
  const hasGames = activeGames.length > 0
  const showInitialLoading = fetchState.isLoading && !hasGames
  const showEmptyState = !showInitialLoading && !fetchState.error && activeGames.length === 0
  const statusTone = fetchState.error
    ? "danger"
    : fetchState.isLoading || fetchState.isRefreshing
      ? "warning"
      : "muted"
  const statusLabel = fetchState.error
    ? "Cache unavailable"
    : fetchState.isLoading
      ? "Loading predictions"
      : fetchState.isRefreshing
        ? "Refreshing predictions"
        : (activeSummary?.message || "Ready")

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
            value={String(activeSummary?.predictionsCreated ?? 0)}
            emphasis
          />
          <DashboardStat
            label="Recommended bets"
            value={String(recommendationCount)}
            tone={recommendationCount > 0 ? "success" : "muted"}
          />
          <DashboardStat
            label="Status"
            value={statusLabel}
            tone={statusTone}
          />
        </div>
      </section>

      {(fetchState.isLoading || fetchState.isRefreshing) && (
        <div className="loadingBanner" role="status" aria-live="polite">
          <span className="loadingSpinner" aria-hidden="true" />
          <span>
            {fetchState.isLoading
              ? "Loading the latest predictions and pricing edges..."
              : "Refreshing predictions in the background so the board stays current..."}
          </span>
        </div>
      )}

      {fetchState.error && (
        <p className="notice notice--error">
          Error loading cached predictions: {fetchState.error}
        </p>
      )}

      {!fetchState.error && activeSummary?.message && !showInitialLoading && !hasGames && !showEmptyState && (
        <p className="notice">{activeSummary.message}</p>
      )}

      {showInitialLoading && <LoadingSkeleton count={3} />}

      {!showInitialLoading && !fetchState.error && topPlays.length > 0 && (
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

      {!showInitialLoading && !fetchState.error && showEmptyState && (
        <EmptyState message={activeSummary?.message} isRefreshing={fetchState.isRefreshing} />
      )}

      {!showInitialLoading && !fetchState.error && hasGames && (
        <section className="gamesGrid" aria-label="Model predictions dashboard">
          {activeGames.map((game, index) => {
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

        .loadingBanner,
        .notice,
        .emptyState {
          margin: 0 0 20px;
          padding: 16px 18px;
          border-radius: 16px;
          background: rgba(30, 41, 59, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.16);
          color: #dbeafe;
        }

        .loadingBanner {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: rgba(30, 64, 175, 0.25);
          border-color: rgba(96, 165, 250, 0.32);
        }

        .loadingSpinner {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid rgba(191, 219, 254, 0.25);
          border-top-color: #bfdbfe;
          animation: spin 0.85s linear infinite;
          flex-shrink: 0;
        }

        .notice--error {
          background: rgba(127, 29, 29, 0.35);
          border-color: rgba(248, 113, 113, 0.36);
        }

        .emptyState {
          padding: 32px 28px;
          text-align: center;
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.14), rgba(15, 23, 42, 0.9) 38%),
            rgba(15, 23, 42, 0.9);
          border-color: rgba(96, 165, 250, 0.26);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.28);
        }

        .emptyState__icon {
          width: 64px;
          height: 64px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          margin-bottom: 16px;
          background: rgba(191, 219, 254, 0.12);
          border: 1px solid rgba(191, 219, 254, 0.2);
          font-size: 1.75rem;
        }

        .emptyState__eyebrow {
          margin-bottom: 8px;
        }

        .emptyState__title {
          margin: 0 0 10px;
          font-size: clamp(1.5rem, 3vw, 2.15rem);
        }

        .emptyState__copy {
          margin: 0 auto;
          max-width: 640px;
          color: #cbd5e1;
          line-height: 1.75;
        }

        .emptyState__actions {
          margin-top: 18px;
          display: flex;
          justify-content: center;
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

        .gameCard--loading {
          overflow: hidden;
          position: relative;
          border-color: rgba(96, 165, 250, 0.22);
        }

        .gameCard--loading::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(191, 219, 254, 0.09), transparent);
          animation: shimmer 1.4s ease-in-out infinite;
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
        .recommendationCard,
        .skeletonPanel {
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

        .skeletonPanel {
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
          overflow: hidden;
        }

        .skeletonBlock,
        .skeletonPill {
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(148, 163, 184, 0.14), rgba(191, 219, 254, 0.26), rgba(148, 163, 184, 0.14));
          background-size: 200% 100%;
          animation: shimmerPulse 1.5s ease-in-out infinite;
        }

        .skeletonBlock--title {
          width: min(280px, 100%);
          height: 56px;
          border-radius: 18px;
        }

        .skeletonBlock--label {
          width: 140px;
          height: 14px;
        }

        .skeletonBlock--lineShort {
          width: 45%;
          height: 16px;
        }

        .skeletonBlock--line,
        .skeletonBlock--lineMuted {
          width: 100%;
          height: 14px;
        }

        .skeletonBlock--lineMuted {
          width: 82%;
        }

        .skeletonPill {
          width: 110px;
          height: 34px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes shimmerPulse {
          0% {
            background-position: 100% 0;
          }

          100% {
            background-position: -100% 0;
          }
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

          .analyticsBlock__row {
            display: flex;
            flex-direction: column;
            gap: 4px;
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

          .loadingBanner {
            display: flex;
            width: auto;
          }
        }
      `}</style>
    </main>
  )
}
