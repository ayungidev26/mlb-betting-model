import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/router"

import {
  buildHomePageProps,
  buildHomePageViewModel,
  loadHomePageData
} from "../lib/homePageProps"
import {
  getGameBetType
} from "../lib/gameFilters"
import { getSessionExpirationTimestamp, readSessionCookie } from "../lib/appAuth"

export async function getServerSideProps(context) {
  const response = await buildHomePageProps(() => loadHomePageData(context.req))
  const sessionToken = readSessionCookie(context.req?.headers?.cookie || "")

  return {
    ...response,
    props: {
      ...response.props,
      sessionExpiresAt: getSessionExpirationTimestamp(sessionToken)
    }
  }
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

function formatOffenseRate(value) {
  return typeof value === "number"
    ? `${(value * 100).toFixed(1)}%`
    : "N/A"
}

function formatOffenseRatingValue(value) {
  return typeof value === "number"
    ? Math.round(value).toString()
    : "N/A"
}

function formatFactor(value) {
  return typeof value === "number"
    ? `${value.toFixed(2)}x`
    : "1.00x"
}

function formatClassification(value) {
  if (!value) {
    return "Neutral"
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getParkClassificationTone(value) {
  if (value === "pitcher-friendly") {
    return "pitcher"
  }

  if (value === "hitter-friendly") {
    return "hitter"
  }

  return "neutral"
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

function formatGameTimeEastern(value) {
  if (!value) {
    return "Time TBD (ET)"
  }

  return `${new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  })} ET`
}

function formatBetTypeLabel(value) {
  if (!value || value === "all") {
    return "All bet types"
  }

  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
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

function formatPitcherRecord(stats) {
  if (!stats) {
    return "N/A"
  }

  const wins = typeof stats.wins === "number" ? stats.wins : null
  const losses = typeof stats.losses === "number" ? stats.losses : null

  if (wins === null || losses === null) {
    return "N/A"
  }

  return `${wins}-${losses}`
}

function formatPitcherInnings(stats) {
  return typeof stats?.innings === "number"
    ? stats.innings.toFixed(1)
    : "N/A"
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
  const bestSportsbookName = game?.bestSportsbookName || game?.sportsbookName || game?.bestSportsbook || game?.sportsbook || null

  return {
    bestOdds: typeof game?.bestOdds === "number"
      ? formatMoneyline(game.bestOdds)
      : "N/A",
    bestSportsbook: bestSportsbookName || "Sportsbook unavailable",
    draftKingsOdds: typeof game?.draftKingsOdds === "number"
      ? formatMoneyline(game.draftKingsOdds)
      : "Unavailable",
    fanDuelOdds: typeof game?.fanDuelOdds === "number"
      ? formatMoneyline(game.fanDuelOdds)
      : "Unavailable",
    modelOdds: modelOdds !== null
      ? formatMoneyline(modelOdds)
      : "N/A"
  }
}

function formatBestOddsSummary(game) {
  const sportsbook = game?.bestSportsbookName || game?.sportsbookName || game?.bestSportsbook || game?.sportsbook || "Sportsbook unavailable"
  const odds = typeof game?.bestOdds === "number"
    ? formatMoneyline(game.bestOdds)
    : "N/A"

  return `${sportsbook} (${odds})`
}

function getBallparkSummary(ballpark) {
  if (!ballpark) {
    return "Neutral park baseline"
  }

  return [
    ballpark.venue || "Unknown park",
    formatClassification(ballpark.classification),
    `Run ${formatFactor(ballpark.runFactor)}`,
    `HR ${formatFactor(ballpark.homeRunFactor)}`
  ].join(" • ")
}

function getBallparkAdjustmentSummary(details) {
  if (!details) {
    return "Neutral park adjustment"
  }

  return [
    `Expected runs ${formatMetricValue(details.expectedRuns)}`,
    `Rating adj ${typeof details.ratingAdjustment === "number" ? (details.ratingAdjustment > 0 ? "+" : "") + details.ratingAdjustment.toFixed(1) : "0.0"}`,
    `Handedness ${formatFactor(details.factors?.handednessFactor)}`
  ].join(" • ")
}

function DashboardStat({ label, value, emphasis = false, tone = "default" }) {
  return (
    <div className={`statCard statCard--${tone} ${emphasis ? "statCard--emphasis" : ""}`}>
      <span className="statCard__label">{label}</span>
      <strong className="statCard__value">{value}</strong>
    </div>
  )
}

function SectionBlock({ kicker, title, subtitle, children }) {
  return (
    <section className="contentBlock">
      <div className="contentBlock__header">
        <div>
          <p className="contentBlock__kicker">{kicker}</p>
          <h3 className="contentBlock__title">{title}</h3>
        </div>
        {subtitle ? <p className="contentBlock__subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function PitcherPanel({ side, team, pitcher, probability, details }) {
  return (
    <div className="detailCard detailCard--compact">
      <div className="detailCard__row detailCard__row--start">
        <div>
          <p className="detailCard__eyebrow">{side}</p>
          <h4 className="detailCard__title">{team}</h4>
        </div>
        <div className="detailCard__value">{formatPercent(probability)}</div>
      </div>

      <p className="detailCard__headline">{pitcher || "TBD"}</p>
      <p className="detailCard__copy">{getPitcherStatLine(details?.stats)}</p>
    </div>
  )
}

function InfoList({ items }) {
  return (
    <div className="detailCard">
      <div className="detailList">
        {items.map((item) => (
          <div className="detailList__item" key={item.label}>
            <span className="detailList__label">{item.label}</span>
            <span className="detailList__value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryInfoList({ items }) {
  return (
    <dl className="summaryInfoList">
      {items.map((item) => (
        <div className="summaryInfoList__item" key={item.label}>
          <dt className="summaryInfoList__label">{item.label}</dt>
          <dd className="summaryInfoList__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ParkClassificationBadge({ classification }) {
  const tone = getParkClassificationTone(classification)

  return (
    <span className={`parkBadge parkBadge--${tone}`}>
      {formatClassification(classification)}
    </span>
  )
}

function BallparkPanel({ ballpark, venue }) {
  const classification = ballpark?.classification || "neutral"
  const parkName = ballpark?.venue || venue || "Unknown park"

  return (
    <div className="detailCard detailCard--compact ballparkPanel">
      <div className="ballparkPanel__header">
        <div>
          <div className="ballparkPanel__eyebrowRow">
            <span className="detailCard__eyebrow">Ballpark</span>
            <span
              className="ballparkPanel__info"
              role="img"
              aria-label="Ballpark factors info"
              title="Park factors compare how a stadium changes scoring and home run output versus league average. 1.00x is neutral."
            >
              ⓘ
            </span>
          </div>
          <h4 className="detailCard__title">{parkName}</h4>
        </div>
        <ParkClassificationBadge classification={classification} />
      </div>

      <div className="ballparkPanel__metrics" aria-label="Ballpark factor summary">
        <div className="ballparkMetric">
          <span className="ballparkMetric__label">Run factor</span>
          <strong className="ballparkMetric__value">{formatFactor(ballpark?.runFactor)}</strong>
        </div>
        <div className="ballparkMetric">
          <span className="ballparkMetric__label">Home run factor</span>
          <strong className="ballparkMetric__value">{formatFactor(ballpark?.homeRunFactor)}</strong>
        </div>
      </div>
    </div>
  )
}

function OffenseComparison({ awayTeam, homeTeam, awayOffense, homeOffense }) {
  const awayStats = awayOffense?.stats?.overall || null
  const homeStats = homeOffense?.stats?.overall || null
  const awayDerived = awayOffense?.derived || null
  const homeDerived = homeOffense?.derived || null
  const buildBarComparison = (awayRaw, homeRaw) => {
    const awayNumber = typeof awayRaw === "number" && Number.isFinite(awayRaw) ? awayRaw : null
    const homeNumber = typeof homeRaw === "number" && Number.isFinite(homeRaw) ? homeRaw : null

    if (awayNumber === null || homeNumber === null) {
      return null
    }

    const strongestValue = Math.max(awayNumber, homeNumber)
    if (strongestValue <= 0) {
      return {
        awayWidth: 0,
        homeWidth: 0,
        awayIsStronger: false,
        homeIsStronger: false
      }
    }

    return {
      awayWidth: (awayNumber / strongestValue) * 100,
      homeWidth: (homeNumber / strongestValue) * 100,
      awayIsStronger: awayNumber > homeNumber,
      homeIsStronger: homeNumber > awayNumber
    }
  }

  const comparisonRows = [
    {
      label: "Offense Rating",
      awayValue: formatOffenseRatingValue(awayOffense?.rating),
      homeValue: formatOffenseRatingValue(homeOffense?.rating)
    },
    {
      label: "wRC+",
      awayValue: formatMetricValue(awayStats?.weightedRunsCreatedPlus, 1),
      homeValue: formatMetricValue(homeStats?.weightedRunsCreatedPlus, 1),
      barComparison: buildBarComparison(awayStats?.weightedRunsCreatedPlus, homeStats?.weightedRunsCreatedPlus)
    },
    {
      label: "OPS",
      awayValue: formatMetricValue(awayStats?.ops, 3),
      homeValue: formatMetricValue(homeStats?.ops, 3),
      barComparison: buildBarComparison(awayStats?.ops, homeStats?.ops)
    },
    {
      label: "Power (ISO)",
      awayValue: formatMetricValue(awayStats?.isolatedPower, 3),
      homeValue: formatMetricValue(homeStats?.isolatedPower, 3),
      barComparison: buildBarComparison(awayStats?.isolatedPower, homeStats?.isolatedPower)
    },
    {
      label: "Plate Discipline (K% / BB%)",
      awayValue: `${formatOffenseRate(awayStats?.strikeoutRate)} / ${formatOffenseRate(awayStats?.walkRate)}`,
      homeValue: `${formatOffenseRate(homeStats?.strikeoutRate)} / ${formatOffenseRate(homeStats?.walkRate)}`
    }
  ]

  return (
    <div className="detailCard detailCard--comparison">
      <div className="comparisonTable" role="table" aria-label="Team offense comparison">
        <div className="comparisonTable__header" role="row">
          <span className="comparisonTable__spacer" aria-hidden="true" />
          <span className="comparisonTable__team" role="columnheader">{awayTeam}</span>
          <span className="comparisonTable__team" role="columnheader">{homeTeam}</span>
        </div>

        <div className="comparisonTable__body" role="rowgroup">
          {comparisonRows.map((row) => (
            <div className="comparisonTable__row" role="row" key={row.label}>
              <span className="comparisonTable__label" role="rowheader">{row.label}</span>
              <strong
                className={`comparisonTable__value${row.barComparison?.awayIsStronger ? " comparisonTable__value--stronger" : ""}`}
                role="cell"
              >
                <span className="comparisonTable__valueText">{row.awayValue}</span>
                {row.barComparison ? (
                  <span className="comparisonTable__barTrack" aria-hidden="true">
                    <span
                      className={`comparisonTable__barFill${row.barComparison.awayIsStronger ? " comparisonTable__barFill--stronger" : ""}`}
                      style={{ width: `${row.barComparison.awayWidth}%` }}
                    />
                  </span>
                ) : null}
              </strong>
              <strong
                className={`comparisonTable__value${row.barComparison?.homeIsStronger ? " comparisonTable__value--stronger" : ""}`}
                role="cell"
              >
                <span className="comparisonTable__valueText">{row.homeValue}</span>
                {row.barComparison ? (
                  <span className="comparisonTable__barTrack" aria-hidden="true">
                    <span
                      className={`comparisonTable__barFill${row.barComparison.homeIsStronger ? " comparisonTable__barFill--stronger" : ""}`}
                      style={{ width: `${row.barComparison.homeWidth}%` }}
                    />
                  </span>
                ) : null}
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className="comparisonHighlights" aria-label="Additional offense context">
        <div className="comparisonHighlights__item">
          <span className="detailCard__eyebrow">{awayTeam} split</span>
          <p className="detailCard__copy">
            vs {awayDerived?.opposingPitcherHand || "?"}: {formatMetricValue(
              awayDerived?.offenseVsHandedness,
              awayDerived?.offenseVsHandedness > 2 ? 1 : 3
            )} • Recent form {formatOffenseRatingValue(awayDerived?.recentOffenseForm)}
          </p>
        </div>
        <div className="comparisonHighlights__item">
          <span className="detailCard__eyebrow">{homeTeam} split</span>
          <p className="detailCard__copy">
            vs {homeDerived?.opposingPitcherHand || "?"}: {formatMetricValue(
              homeDerived?.offenseVsHandedness,
              homeDerived?.offenseVsHandedness > 2 ? 1 : 3
            )} • Recent form {formatOffenseRatingValue(homeDerived?.recentOffenseForm)}
          </p>
        </div>
      </div>
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
              <section className="contentBlock" key={`loading-column-${columnIndex}`}>
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
        <span className="tag tag--muted">
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

export default function Home({ games = [], summary, error = "", sessionExpiresAt = null }) {
  const router = useRouter()
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
  const recommendationCount = activeGames.filter((game) => typeof game?.edge === "number").length
  const gamesLoadedCount = activeGames.length
  const displayedGames = activeGames
  const topPlays = displayedGames
  const hasGames = activeGames.length > 0
  const hasDisplayedGames = displayedGames.length > 0
  const showInitialLoading = fetchState.isLoading && !hasGames
  const showCountPlaceholder = showInitialLoading || fetchState.isRefreshing
  const todayGamesDisplay = showCountPlaceholder ? "—" : String(gamesLoadedCount)
  const recommendedBetsDisplay = showCountPlaceholder ? "—" : String(recommendationCount)
  const showEmptyState = !showInitialLoading && !fetchState.error && !hasGames

  const handleLogout = useCallback(async (reason = "manual") => {
    try {
      setFetchState((currentState) => ({
        ...currentState,
        isRefreshing: currentState.isRefreshing || reason === "manual"
      }))

      await fetch("/api/logout", {
        method: "POST"
      })
    } catch (logoutError) {
      // Swallow network errors so the redirect still clears the local session view.
    } finally {
      await router.push(reason === "expired" ? "/login?error=expired" : "/login")
    }
  }, [router])

  useEffect(() => {
    if (typeof sessionExpiresAt !== "number") {
      return undefined
    }

    const remainingMs = sessionExpiresAt - Date.now()

    if (remainingMs <= 0) {
      handleLogout("expired")
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      handleLogout("expired")
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [handleLogout, sessionExpiresAt])

  return (
    <main className="dashboard">
      <section className="topNav shellCard">
        <nav className="viewTabs" aria-label="Primary">
          <Link href="/" className="viewTabs__link viewTabs__link--active" aria-current="page">Dashboard</Link>
          <Link href="/stats" className="viewTabs__link">Stats</Link>
        </nav>
      </section>

      <section className="hero shellCard">
        <div className="hero__identity">
          <h1>MLB Model Dashboard</h1>
          <p className="hero__summaryLine">
            Predictive MLB betting model using pitcher, bullpen, offense, and market data
          </p>
          <p className="hero__summaryLine">
            Identifies recommended bets by comparing model probabilities against sportsbook odds
          </p>
        </div>

        <div className="hero__kpis" aria-label="Daily board summary">
          <DashboardStat
            label="Today&apos;s games"
            value={todayGamesDisplay}
            emphasis={!showCountPlaceholder}
          />
          <DashboardStat
            label="Recommended bets"
            value={recommendedBetsDisplay}
            tone={!showCountPlaceholder && recommendationCount > 0 ? "success" : "muted"}
            emphasis={!showCountPlaceholder && recommendationCount > 0}
          />
        </div>

        <div className="hero__account">
          <button
            type="button"
            className="logoutButton"
            onClick={() => handleLogout("manual")}
          >
            Logout
          </button>
        </div>
      </section>

      {(fetchState.isLoading || fetchState.isRefreshing) && (
        <div className="notice notice--info" role="status" aria-live="polite">
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
        <section className="shellCard boardSection" aria-label="Top Plays">
          <div className="sectionIntro">
            <div>
              <p className="eyebrow sectionIntro__eyebrow">Best bets</p>
              <h2 className="sectionTitle">Today&apos;s games ranked by edge</h2>
            </div>
            <p className="sectionIntro__copy">
              Every matchup is listed below with edge ratings, probable starters, and best available price.
            </p>
          </div>

          <div className="summaryGrid">
            {topPlays.map((game, index) => {
              const edgeTier = getEdgeTier(game.edge)
              const recommendedSide = game.recommendedBet || edgeTier.recommendation
              const betType = getGameBetType(game)
              const awayPitcherStats = game.pitcherModel?.away?.stats || null
              const homePitcherStats = game.pitcherModel?.home?.stats || null
              const fairOddsSummary = getOddsComparison(game).modelOdds

              return (
                <article
                  className={`summaryCard summaryCard--${edgeTier.tone}`}
                  key={`top-play-${game.matchKey || game.gameId || `${game.homeTeam}-${game.awayTeam}-${index}`}`}
                >
                  <div className="summaryCard__header">
                    <div className="summaryCard__headerBadges">
                      <span className="tag tag--muted">#{index + 1}</span>
                      <span className={`tag tag--${edgeTier.tone}`}>{edgeTier.label}</span>
                    </div>
                    <p className="summaryCard__time">{formatGameTimeEastern(game.date)}</p>
                  </div>

                  <section className="summaryCard__section summaryCard__section--matchup" aria-label="Matchup">
                    <h3 className="summaryCard__title">
                      <span>{game.awayTeam}</span>
                      <span className="vs">@</span>
                      <span>{game.homeTeam}</span>
                    </h3>
                  </section>

                  <section className="summaryCard__section" aria-label="Supporting stats">
                    <p className="summaryCard__sectionTitle">Supporting stats</p>
                    <div className="summaryStatStack">
                      <div className="summaryStatLine">
                        <span className="summaryStatLine__team">Probable pitchers</span>
                        <span className="summaryStatLine__stats">
                          {game.awayPitcher || "TBD"} vs {game.homePitcher || "TBD"}
                        </span>
                      </div>
                      <div className="summaryStatLine">
                        <span className="summaryStatLine__team">{game.awayTeam} SP</span>
                        <span className="summaryStatLine__stats">
                          W-L {formatPitcherRecord(awayPitcherStats)} • IP {formatPitcherInnings(awayPitcherStats)} • ERA {formatMetricValue(awayPitcherStats?.era)} • WHIP {formatMetricValue(awayPitcherStats?.whip)}
                        </span>
                      </div>
                      <div className="summaryStatLine">
                        <span className="summaryStatLine__team">{game.homeTeam} SP</span>
                        <span className="summaryStatLine__stats">
                          W-L {formatPitcherRecord(homePitcherStats)} • IP {formatPitcherInnings(homePitcherStats)} • ERA {formatMetricValue(homePitcherStats?.era)} • WHIP {formatMetricValue(homePitcherStats?.whip)}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="summaryCard__section" aria-label="Betting summary">
                    <p className="summaryCard__sectionTitle">Betting summary</p>
                    <SummaryInfoList
                      items={[
                        { label: "Edge", value: formatEdge(game.edge) },
                        { label: "Bet type", value: formatBetTypeLabel(betType) },
                        { label: "Recommendation", value: recommendedSide },
                        { label: "Best odds", value: formatBestOddsSummary(game) },
                        { label: "Model fair odds", value: fairOddsSummary }
                      ]}
                    />
                  </section>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {!showInitialLoading && !fetchState.error && showEmptyState && (
        <EmptyState message={activeSummary?.message} isRefreshing={fetchState.isRefreshing} />
      )}

      {!showInitialLoading && !fetchState.error && hasDisplayedGames && (
        <section className="gamesGrid" aria-label="Model predictions dashboard">
          {displayedGames.map((game, index) => {
            const edgeTier = getEdgeTier(game.edge)
            const recommendedSide = game.recommendedBet || edgeTier.recommendation
            const awayPitcherDetails = game.pitcherModel?.away || null
            const homePitcherDetails = game.pitcherModel?.home || null
            const awayBullpenDetails = game.bullpenModel?.away || null
            const homeBullpenDetails = game.bullpenModel?.home || null
            const ballparkModel = game.ballparkModel || null
            const awayOffenseDetails = game.offenseModel?.away || null
            const homeOffenseDetails = game.offenseModel?.home || null
            const oddsComparison = getOddsComparison(game)
            const betType = getGameBetType(game)

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
                    <p className="gameCard__submeta">{getBallparkSummary(game.ballpark)}</p>
                  </div>
                  <div className="tagRow tagRow--tight">
                    <span className="tag tag--muted">{formatBetTypeLabel(betType)}</span>
                    <span className={`tag tag--${edgeTier.tone}`}>{edgeTier.label}</span>
                  </div>
                </div>

                <div className="gameCard__body">
                  <SectionBlock
                    kicker="Matchup"
                    title="Projected winner odds"
                    subtitle="Starter snapshot"
                  >
                    <div className="stack">
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
                    </div>
                  </SectionBlock>

                  <SectionBlock
                    kicker="Offense"
                    title="Lineup comparison"
                    subtitle="Quick team strength snapshot"
                  >
                    <OffenseComparison
                      awayTeam={game.awayTeam}
                      homeTeam={game.homeTeam}
                      awayOffense={awayOffenseDetails}
                      homeOffense={homeOffenseDetails}
                    />
                  </SectionBlock>

                  <SectionBlock
                    kicker="Context"
                    title="Pitching and bullpen"
                    subtitle="Model inputs"
                  >
                    <div className="stack">
                      <InfoList
                        items={[
                          { label: `${game.awayTeam} starter`, value: getPitcherStatLine(awayPitcherDetails?.stats) },
                          { label: `${game.homeTeam} starter`, value: getPitcherStatLine(homePitcherDetails?.stats) }
                        ]}
                      />
                      <InfoList
                        items={[
                          { label: `${game.awayTeam} bullpen`, value: getBullpenSummary(awayBullpenDetails) },
                          { label: `${game.homeTeam} bullpen`, value: getBullpenSummary(homeBullpenDetails) }
                        ]}
                      />
                    </div>
                  </SectionBlock>

                  <SectionBlock
                    kicker="Environment"
                    title="Ballpark factors"
                    subtitle="Venue-adjusted offense context"
                  >
                    <div className="stack">
                      <BallparkPanel ballpark={game.ballpark} venue={game.venue} />
                      <InfoList
                        items={[
                          { label: `${game.awayTeam} park impact`, value: getBallparkAdjustmentSummary(ballparkModel?.away) },
                          { label: `${game.homeTeam} park impact`, value: getBallparkAdjustmentSummary(ballparkModel?.home) },
                          { label: "LHH factor", value: formatFactor(game.ballpark?.leftHandedHitterFactor) },
                          { label: "RHH factor", value: formatFactor(game.ballpark?.rightHandedHitterFactor) }
                        ]}
                      />
                    </div>
                  </SectionBlock>

                  <SectionBlock
                    kicker="Edge"
                    title="Bet summary"
                    subtitle="Recommendation"
                  >
                    <div className="stack">
                      <div className="detailCard detailCard--highlight">
                        <p className="detailCard__eyebrow">Recommended side</p>
                        <h4 className="detailCard__hero">{recommendedSide}</h4>
                        <p className="detailCard__copy">
                          {oddsComparison.bestSportsbook
                            ? `Best book: ${oddsComparison.bestSportsbook}`
                            : "Sportsbook line pending"}
                        </p>
                      </div>

                      <div className="metricGrid">
                        <DashboardStat label="Model edge" value={formatEdge(game.edge)} emphasis tone={edgeTier.tone} />
                        <DashboardStat label="Best odds" value={oddsComparison.bestOdds} tone={edgeTier.tone} />
                        <DashboardStat label="DraftKings" value={oddsComparison.draftKingsOdds} tone="muted" />
                        <DashboardStat label="FanDuel" value={oddsComparison.fanDuelOdds} tone="muted" />
                        <DashboardStat label="Fair odds" value={oddsComparison.modelOdds} tone="muted" />
                        <DashboardStat label="Recommendation" value={game.recommendation || recommendedSide} tone={edgeTier.tone} />
                      </div>
                    </div>
                  </SectionBlock>
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
            radial-gradient(circle at top, rgba(59, 130, 246, 0.14), transparent 34%),
            linear-gradient(180deg, #0f172a 0%, #111827 100%);
          color: #e5eefb;
        }

        .dashboard {
          min-height: 100vh;
          max-width: 1320px;
          margin: 0 auto;
          padding: 40px 24px 64px;
          display: grid;
          gap: 24px;
        }

        .shellCard,
        .gameCard,
        .emptyState,
        .notice {
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 24px;
          box-shadow: 0 18px 40px rgba(2, 6, 23, 0.28);
          backdrop-filter: blur(14px);
        }

        .shellCard,
        .gameCard,
        .emptyState,
        .notice,
        .contentBlock,
        .detailCard,
        .statCard,
        .filterControl__select,
        .tag,
        .skeletonPanel {
          box-sizing: border-box;
        }

        .topNav {
          display: flex;
          justify-content: flex-start;
          padding: 10px 14px;
        }

        .viewTabs {
          display: inline-flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .viewTabs__link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 108px;
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(30, 41, 59, 0.88);
          box-shadow: 0 6px 14px rgba(2, 6, 23, 0.25);
          text-decoration: none;
          color: #cbd5e1;
          font-weight: 600;
          font-size: 0.88rem;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
        }

        .viewTabs__link:hover {
          transform: translateY(-1px);
          border-color: rgba(125, 211, 252, 0.6);
          background: rgba(51, 65, 85, 0.95);
        }

        .viewTabs__link:focus-visible {
          outline: 2px solid rgba(125, 211, 252, 0.95);
          outline-offset: 3px;
        }

        .viewTabs__link--active {
          color: #0f172a;
          border-color: rgba(96, 165, 250, 0.9);
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
        }

        .logoutButton {
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          padding: 10px 16px;
          background: rgba(15, 23, 42, 0.78);
          color: #e2e8f0;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }

        .logoutButton:hover {
          background: rgba(30, 41, 59, 0.96);
          border-color: rgba(96, 165, 250, 0.45);
          transform: translateY(-1px);
        }

        .logoutButton:focus-visible {
          outline: 2px solid rgba(147, 197, 253, 0.9);
          outline-offset: 3px;
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.95fr) auto;
          gap: 20px;
          padding: 26px 28px;
          align-items: center;
        }

        .hero__identity {
          min-width: 0;
        }

        .hero__kpis {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-self: stretch;
          width: 100%;
          max-width: 460px;
          justify-self: center;
        }

        .hero__account {
          display: flex;
          justify-content: flex-end;
          align-items: flex-start;
          align-self: start;
        }

        .eyebrow,
        .contentBlock__kicker,
        .detailCard__eyebrow,
        .filterControl__label,
        .statCard__label {
          margin: 0;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #93c5fd;
        }

        h1,
        h2,
        h3,
        h4,
        p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 0;
          font-size: clamp(2.2rem, 4vw, 3.4rem);
          line-height: 1.02;
        }

        .hero__summaryLine,
        .hero__copy,
        .sectionIntro__copy,
        .contentBlock__subtitle,
        .detailCard__copy,
        .emptyState__copy,
        .gameCard__meta,
        .summaryCard__meta {
          color: #94a3b8;
          line-height: 1.6;
        }

        .hero__summaryLine {
          margin: 8px 0 0;
          max-width: 720px;
          font-size: 0.95rem;
          line-height: 1.55;
          color: #9fb2cd;
        }

        .hero__stats,
        .metricGrid,
        .summaryGrid,
        .filterGrid {
          display: grid;
          gap: 14px;
        }

        .hero__stats,
        .filterGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .statCard {
          min-height: 92px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(30, 41, 59, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.14);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
        }

        .statCard__value {
          font-size: 1rem;
          line-height: 1.35;
          color: #f8fafc;
        }

        .statCard--emphasis .statCard__value {
          font-size: 1.7rem;
          letter-spacing: -0.03em;
        }

        .statCard--success,
        .tag--success,
        .summaryCard--success,
        .gameCard--success {
          border-color: rgba(74, 222, 128, 0.32);
        }

        .statCard--warning,
        .tag--warning,
        .summaryCard--warning,
        .gameCard--warning {
          border-color: rgba(250, 204, 21, 0.3);
        }

        .statCard--danger,
        .tag--danger,
        .summaryCard--danger,
        .gameCard--danger {
          border-color: rgba(248, 113, 113, 0.28);
        }

        .statCard--success {
          background: rgba(20, 83, 45, 0.28);
        }

        .statCard--warning {
          background: rgba(113, 63, 18, 0.26);
        }

        .statCard--danger {
          background: rgba(127, 29, 29, 0.24);
        }

        .notice {
          padding: 16px 18px;
          color: #dbeafe;
        }

        .notice--info {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          background: rgba(30, 64, 175, 0.18);
          border-color: rgba(96, 165, 250, 0.26);
        }

        .notice--error {
          background: rgba(127, 29, 29, 0.32);
          border-color: rgba(248, 113, 113, 0.3);
        }

        .loadingSpinner {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid rgba(191, 219, 254, 0.24);
          border-top-color: #bfdbfe;
          animation: spin 0.85s linear infinite;
          flex-shrink: 0;
        }

        .boardSection {
          padding: 24px;
        }

        .sectionIntro {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
          margin-bottom: 18px;
        }

        .sectionIntro__eyebrow {
          margin-bottom: 10px;
        }

        .sectionTitle {
          margin: 0;
          font-size: clamp(1.5rem, 3vw, 2rem);
          line-height: 1.1;
        }

        .sectionIntro__copy {
          max-width: 460px;
          margin-bottom: 0;
        }

        .filterControl {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .filterControl__select {
          width: 100%;
          appearance: none;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(30, 41, 59, 0.72);
          color: #f8fafc;
          font-size: 0.95rem;
        }

        .filterControl__select:focus {
          outline: 2px solid rgba(96, 165, 250, 0.5);
          outline-offset: 2px;
        }

        .tagRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .tagRow--tight {
          justify-content: flex-end;
        }

        .tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(30, 41, 59, 0.68);
          color: #e2e8f0;
          font-size: 0.8rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .tag--muted {
          color: #cbd5e1;
        }

        .tag--success {
          background: rgba(20, 83, 45, 0.28);
          color: #86efac;
        }

        .tag--warning {
          background: rgba(120, 53, 15, 0.28);
          color: #fde68a;
        }

        .tag--danger {
          background: rgba(127, 29, 29, 0.26);
          color: #fca5a5;
        }

        .summaryGrid {
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }

        .summaryCard {
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.7);
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-wrap: anywhere;
        }

        .summaryCard__header,
        .gameCard__header,
        .detailCard__row,
        .contentBlock__header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
        }

        .summaryCard__meta,
        .gameCard__meta {
          margin: 0;
          font-size: 0.9rem;
        }

        .summaryCard__title,
        .gameCard__title {
          margin-bottom: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          line-height: 1.25;
          color: #f8fafc;
        }

        .gameCard__submeta {
          margin: 8px 0 0;
          color: #cbd5e1;
          font-size: 0.92rem;
        }

        .summaryCard__title {
          font-size: 1.3rem;
          margin: 0;
        }

        .gameCard__title {
          font-size: 1.4rem;
        }

        .vs {
          color: #60a5fa;
          font-weight: 800;
        }

        .metricGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .summaryCard__header {
          align-items: center;
          gap: 12px;
        }

        .summaryCard__headerBadges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .summaryCard__time {
          margin: 0;
          font-size: 0.86rem;
          line-height: 1.45;
          color: #cbd5e1;
          text-align: right;
        }

        .summaryCard__section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
        }

        .summaryCard__section--matchup {
          padding-top: 0;
          border-top: 0;
          gap: 8px;
        }

        .summaryCard__sectionTitle {
          margin: 0;
          font-size: 0.76rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
          font-weight: 700;
        }

        .summaryStatStack {
          display: grid;
          gap: 10px;
        }

        .summaryStatLine {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .summaryStatLine__team {
          font-size: 0.8rem;
          font-weight: 700;
          color: #e2e8f0;
          line-height: 1.4;
        }

        .summaryStatLine__stats {
          font-size: 0.9rem;
          color: #94a3b8;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .summaryInfoList {
          margin: 0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 14px;
        }

        .summaryInfoList__item {
          margin: 0;
          min-width: 0;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.14);
          display: grid;
          gap: 6px;
          align-content: start;
        }

        .summaryInfoList__label {
          margin: 0;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #94a3b8;
          line-height: 1.3;
        }

        .summaryInfoList__value {
          margin: 0;
          color: #f8fafc;
          line-height: 1.5;
          font-size: 0.92rem;
          overflow-wrap: anywhere;
        }

        .gamesGrid {
          display: grid;
          gap: 18px;
        }

        .gameCard {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: rgba(15, 23, 42, 0.8);
        }

        .gameCard--success {
          background: linear-gradient(180deg, rgba(22, 101, 52, 0.14), rgba(15, 23, 42, 0.82) 20%);
        }

        .gameCard--warning {
          background: linear-gradient(180deg, rgba(161, 98, 7, 0.14), rgba(15, 23, 42, 0.82) 20%);
        }

        .gameCard--danger {
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.14), rgba(15, 23, 42, 0.82) 20%);
        }

        .gameCard--loading {
          overflow: hidden;
          position: relative;
        }

        .gameCard--loading::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(191, 219, 254, 0.08), transparent);
          animation: shimmer 1.4s ease-in-out infinite;
        }

        .gameCard__body {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }

        .contentBlock {
          padding: 18px;
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.54);
          border: 1px solid rgba(148, 163, 184, 0.12);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .contentBlock__title {
          margin: 6px 0 0;
          font-size: 1.05rem;
          color: #f8fafc;
        }

        .contentBlock__subtitle {
          margin-bottom: 0;
          font-size: 0.88rem;
          max-width: 180px;
        }

        .stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .detailCard,
        .skeletonPanel {
          padding: 16px;
          border-radius: 18px;
          background: rgba(30, 41, 59, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.12);
        }

        .detailCard--compact {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detailCard--highlight {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.14), rgba(30, 41, 59, 0.8));
        }

        .detailCard__row--start {
          align-items: flex-start;
        }

        .detailCard__title,
        .detailCard__hero,
        .detailCard__headline {
          margin-bottom: 0;
          color: #f8fafc;
        }

        .detailCard__title {
          font-size: 1.05rem;
        }

        .detailCard__hero {
          font-size: 1.3rem;
        }

        .detailCard__headline {
          font-size: 0.98rem;
          font-weight: 700;
        }

        .detailCard__value {
          font-size: 1.25rem;
          font-weight: 800;
          color: #f8fafc;
          white-space: nowrap;
        }

        .detailCard--comparison {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ballparkPanel {
          gap: 16px;
        }

        .ballparkPanel__header,
        .ballparkPanel__eyebrowRow,
        .ballparkPanel__metrics {
          display: flex;
        }

        .ballparkPanel__header {
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .ballparkPanel__eyebrowRow {
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .ballparkPanel__info {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          color: #cbd5e1;
          font-size: 0.78rem;
          cursor: help;
        }

        .ballparkPanel__metrics {
          gap: 10px;
          flex-wrap: wrap;
        }

        .ballparkMetric {
          flex: 1 1 140px;
          min-width: 0;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.12);
          display: grid;
          gap: 6px;
        }

        .ballparkMetric__label {
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .ballparkMetric__value {
          color: #f8fafc;
          font-size: 1rem;
        }

        .parkBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 800;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        .parkBadge--pitcher {
          background: rgba(20, 83, 45, 0.28);
          border-color: rgba(74, 222, 128, 0.32);
          color: #86efac;
        }

        .parkBadge--neutral {
          background: rgba(51, 65, 85, 0.56);
          border-color: rgba(148, 163, 184, 0.22);
          color: #e2e8f0;
        }

        .parkBadge--hitter {
          background: rgba(154, 52, 18, 0.32);
          border-color: rgba(251, 146, 60, 0.34);
          color: #fdba74;
        }

        .comparisonTable,
        .comparisonTable__body {
          display: grid;
          gap: 10px;
        }

        .comparisonTable__header,
        .comparisonTable__row {
          display: grid;
          grid-template-columns: minmax(120px, 1.2fr) repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-items: center;
        }

        .comparisonTable__header {
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }

        .comparisonTable__row {
          padding: 10px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.08);
        }

        .comparisonTable__row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .comparisonTable__spacer,
        .comparisonTable__label {
          color: #cbd5e1;
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .comparisonTable__team {
          font-size: 0.82rem;
          font-weight: 800;
          color: #f8fafc;
          text-align: center;
        }

        .comparisonTable__value {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: stretch;
          min-height: 40px;
          padding: 8px 10px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.12);
          color: #f8fafc;
          font-size: 0.9rem;
          text-align: center;
          gap: 6px;
        }

        .comparisonTable__valueText {
          display: block;
        }

        .comparisonTable__value--stronger {
          border-color: rgba(59, 130, 246, 0.55);
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.18);
        }

        .comparisonTable__barTrack {
          display: block;
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.22);
          overflow: hidden;
        }

        .comparisonTable__barFill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: rgba(148, 163, 184, 0.58);
        }

        .comparisonTable__barFill--stronger {
          background: linear-gradient(90deg, #38bdf8, #3b82f6);
        }

        .comparisonHighlights {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding-top: 2px;
        }

        .comparisonHighlights__item {
          padding-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
        }

        .detailList {
          display: grid;
          gap: 12px;
        }

        .detailList__item {
          display: grid;
          gap: 6px;
        }

        .detailList__label {
          font-size: 0.8rem;
          font-weight: 700;
          color: #e2e8f0;
        }

        .detailList__value {
          color: #94a3b8;
          line-height: 1.55;
          font-size: 0.92rem;
        }

        .emptyState {
          padding: 32px 28px;
          text-align: center;
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.9) 40%),
            rgba(15, 23, 42, 0.88);
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
          border: 1px solid rgba(191, 219, 254, 0.18);
          font-size: 1.75rem;
        }

        .emptyState__eyebrow {
          margin-bottom: 8px;
        }

        .emptyState__title {
          margin-bottom: 10px;
          font-size: clamp(1.5rem, 3vw, 2rem);
        }

        .emptyState__copy {
          max-width: 640px;
          margin: 0 auto;
          color: #cbd5e1;
        }

        .emptyState__actions {
          margin-top: 18px;
          display: flex;
          justify-content: center;
        }

        .skeletonBlock,
        .skeletonPill {
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(148, 163, 184, 0.14), rgba(191, 219, 254, 0.24), rgba(148, 163, 184, 0.14));
          background-size: 200% 100%;
          animation: shimmerPulse 1.5s ease-in-out infinite;
        }

        .skeletonBlock--title {
          width: min(280px, 100%);
          height: 56px;
          border-radius: 18px;
        }

        .skeletonBlock--label {
          width: 120px;
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

        @media (max-width: 1080px) {
          .gameCard__body {
            grid-template-columns: 1fr;
          }

          .hero {
            grid-template-columns: 1fr;
            gap: 16px;
            align-items: start;
          }

          .hero__kpis {
            justify-self: stretch;
            max-width: none;
          }

          .hero__account {
            justify-content: flex-start;
          }
        }

        @media (max-width: 900px) {
          .sectionIntro,
          .summaryCard__header,
          .gameCard__header,
          .contentBlock__header,
          .detailCard__row,
          .ballparkPanel__header {
            flex-direction: column;
          }

          .hero__stats,
          .hero__kpis,
          .filterGrid,
          .metricGrid,
          .comparisonHighlights {
            grid-template-columns: 1fr;
          }

          .topNav {
            padding: 10px 12px;
          }

          .tagRow--tight {
            justify-content: flex-start;
          }

          .summaryCard__time {
            text-align: left;
          }
        }

        @media (max-width: 640px) {
          .dashboard {
            padding: 24px 16px 48px;
          }

          .hero,
          .boardSection,
          .gameCard,
          .emptyState {
            padding: 20px;
          }

          .comparisonTable__header,
          .comparisonTable__row {
            grid-template-columns: minmax(92px, 1fr) repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .comparisonTable__label,
          .comparisonTable__team,
          .comparisonTable__value {
            font-size: 0.76rem;
          }

          .summaryInfoList {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  )
}
