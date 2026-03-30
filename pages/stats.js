import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"

const SECTION_ORDER = [
  { key: "pitchers", title: "Pitchers", recordLabel: "Pitchers" },
  { key: "bullpen", title: "Bullpens", recordLabel: "Teams" },
  { key: "offense", title: "Offense", recordLabel: "Teams" }
]

const MAX_COLUMNS = 14
const DEFAULT_TAB = "pitchers"
const MISSING_VALUE = "—"

const PITCHER_COLUMN_CONFIG = [
  { key: "pitcherName", label: "Pitcher Name", align: "left" },
  { key: "__teamDisplay", label: "Team", align: "left" },
  { key: "throwingHand", label: "Hand", align: "center" },
  { key: "wins", label: "Wins", align: "right", format: "integer" },
  { key: "losses", label: "Losses", align: "right", format: "integer" },
  { key: "era", label: "ERA", align: "right", format: "decimal2" },
  { key: "xera", label: "xERA", align: "right", format: "decimal2" },
  { key: "whip", label: "WHIP", align: "right", format: "decimal3" },
  { key: "fip", label: "FIP", align: "right", format: "decimal2" },
  { key: "xfip", label: "xFIP", align: "right", format: "decimal2" },
  { key: "strikeouts", label: "Strikeouts", align: "right", format: "integer" },
  { key: "walks", label: "Walks", align: "right", format: "integer" },
  { key: "strikeoutRate", label: "K%", align: "right", format: "percent" },
  { key: "walkRate", label: "BB%", align: "right", format: "percent" },
  { key: "strikeoutMinusWalkRate", label: "K-BB%", align: "right", format: "percent" }
]

const MLB_TEAM_ABBREVIATIONS = {
  ARI: "Arizona Diamondbacks",
  ATL: "Atlanta Braves",
  BAL: "Baltimore Orioles",
  BOS: "Boston Red Sox",
  CHC: "Chicago Cubs",
  CHW: "Chicago White Sox",
  CIN: "Cincinnati Reds",
  CLE: "Cleveland Guardians",
  COL: "Colorado Rockies",
  DET: "Detroit Tigers",
  HOU: "Houston Astros",
  KCR: "Kansas City Royals",
  LAA: "Los Angeles Angels",
  LAD: "Los Angeles Dodgers",
  MIA: "Miami Marlins",
  MIL: "Milwaukee Brewers",
  MIN: "Minnesota Twins",
  NYM: "New York Mets",
  NYY: "New York Yankees",
  ATH: "Oakland Athletics",
  OAK: "Oakland Athletics",
  PHI: "Philadelphia Phillies",
  PIT: "Pittsburgh Pirates",
  SDP: "San Diego Padres",
  SD: "San Diego Padres",
  SFG: "San Francisco Giants",
  SF: "San Francisco Giants",
  SEA: "Seattle Mariners",
  STL: "St. Louis Cardinals",
  TBR: "Tampa Bay Rays",
  TB: "Tampa Bay Rays",
  TEX: "Texas Rangers",
  TOR: "Toronto Blue Jays",
  WSN: "Washington Nationals",
  WAS: "Washington Nationals"
}

function normalizeTabKey(value) {
  const match = SECTION_ORDER.find((section) => section.key === value)
  return match ? match.key : DEFAULT_TAB
}

function formatDateTime(value) {
  if (!value) {
    return "N/A"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  const datePart = parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  })
  const timePart = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York"
  })

  return `${datePart} at ${timePart} ET`
}

function formatSlateLoadedAt(value) {
  if (!value) {
    return "Not loaded"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return "Not loaded"
  }

  return `${parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York"
  })} ET`
}

function flattenRecord(record, prefix = "") {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {}
  }

  const flattened = {}

  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value === null || value === undefined) {
      flattened[path] = null
      continue
    }

    if (Array.isArray(value)) {
      flattened[path] = value.length > 0 ? JSON.stringify(value) : "[]"
      continue
    }

    if (typeof value === "object") {
      Object.assign(flattened, flattenRecord(value, path))
      continue
    }

    flattened[path] = value
  }

  return flattened
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return MISSING_VALUE
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  return String(value)
}

function toDisplayPercentage(value) {
  if (value === null || value === undefined || value === "") {
    return MISSING_VALUE
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return MISSING_VALUE
  }

  return `${(numericValue * 100).toFixed(1)}%`
}

function formatStatValue(value, format = "default") {
  if (value === null || value === undefined || value === "") {
    return MISSING_VALUE
  }

  const numericValue = Number(value)

  if (format === "percent") {
    return toDisplayPercentage(value)
  }

  if (!Number.isFinite(numericValue)) {
    return toDisplayValue(value)
  }

  if (format === "integer") {
    return Math.round(numericValue).toString()
  }

  if (format === "decimal2") {
    return numericValue.toFixed(2)
  }

  if (format === "decimal3") {
    return numericValue.toFixed(3)
  }

  return toDisplayValue(value)
}

function resolvePitcherTeamName(row) {
  const teamName = typeof row?.teamName === "string" ? row.teamName.trim() : ""
  if (teamName) {
    return teamName
  }

  const rawAbbreviation = typeof row?.teamAbbr === "string" ? row.teamAbbr.trim().toUpperCase() : ""
  if (rawAbbreviation && MLB_TEAM_ABBREVIATIONS[rawAbbreviation]) {
    return MLB_TEAM_ABBREVIATIONS[rawAbbreviation]
  }

  const fallbackAbbreviation = typeof row?.team === "string" ? row.team.trim().toUpperCase() : ""
  if (fallbackAbbreviation && MLB_TEAM_ABBREVIATIONS[fallbackAbbreviation]) {
    return MLB_TEAM_ABBREVIATIONS[fallbackAbbreviation]
  }

  return MISSING_VALUE
}

function normalizeSectionRecords(section, sectionKey) {
  const rawData = section?.data

  if (!rawData || typeof rawData !== "object") {
    return []
  }

  if (Array.isArray(rawData)) {
    return rawData.map((record, index) => ({
      __id: `${sectionKey}-${index}`,
      __label: String(index + 1),
      ...flattenRecord(record)
    }))
  }

  return Object.entries(rawData).map(([recordKey, record]) => {
    const flattened = flattenRecord(record)

    return {
      __id: `${sectionKey}-${recordKey}`,
      __label: recordKey,
      ...flattened,
      ...(flattened.teamName ? {} : { teamName: recordKey })
    }
  })
}

function getDefaultSortKey(rows) {
  if (!rows.length) {
    return null
  }

  const preferredKeys = [
    "pitcherName",
    "teamName",
    "team",
    "name",
    "era",
    "ops",
    "weightedOnBaseAverage"
  ]

  const sample = rows[0]

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(sample, key)) {
      return key
    }
  }

  return Object.keys(sample).find((key) => !key.startsWith("__")) || null
}

function sortRows(rows, sortKey, direction) {
  if (!sortKey) {
    return rows
  }

  return [...rows].sort((a, b) => {
    const aValue = a[sortKey]
    const bValue = b[sortKey]

    if (aValue === bValue) {
      return 0
    }

    if (aValue === null || aValue === undefined) {
      return 1
    }

    if (bValue === null || bValue === undefined) {
      return -1
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return direction === "asc" ? aValue - bValue : bValue - aValue
    }

    const comparison = String(aValue).localeCompare(String(bValue), undefined, {
      sensitivity: "base",
      numeric: true
    })

    return direction === "asc" ? comparison : -comparison
  })
}

function renderPitcherPipelineText({ loading, pitchersFetched, pitchersSaved }) {
  if (loading) {
    return "Loading..."
  }

  const fetchedText = pitchersFetched === null || pitchersFetched === undefined ? "—" : toDisplayValue(pitchersFetched)
  const savedText = pitchersSaved === null || pitchersSaved === undefined ? "—" : toDisplayValue(pitchersSaved)

  return `${savedText} Pitchers Saved / ${fetchedText} Pitchers Fetched`
}

function StatsSection({ title, sectionKey, section, query }) {
  const records = useMemo(
    () => normalizeSectionRecords(section, sectionKey),
    [section, sectionKey]
  )
  const decoratedRows = useMemo(
    () => records.map((row) => ({ ...row, __teamDisplay: resolvePitcherTeamName(row) })),
    [records]
  )
  const [sort, setSort] = useState({
    key: getDefaultSortKey(records),
    direction: "asc"
  })

  useEffect(() => {
    setSort({
      key: getDefaultSortKey(records),
      direction: "asc"
    })
  }, [records])

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const sourceRows = sectionKey === "pitchers" ? decoratedRows : records

    const filtered = normalizedQuery
      ? sourceRows.filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(normalizedQuery)))
      : sourceRows

    return sortRows(filtered, sort.key, sort.direction)
  }, [decoratedRows, records, query, sectionKey, sort])

  const columns = useMemo(() => {
    if (sectionKey === "pitchers") {
      return PITCHER_COLUMN_CONFIG.filter((column) =>
        column.key === "__teamDisplay" || decoratedRows.some((row) => row[column.key] !== undefined)
      )
    }

    const keyWeights = new Map()

    for (const row of records) {
      for (const key of Object.keys(row)) {
        if (key.startsWith("__")) {
          continue
        }

        keyWeights.set(key, (keyWeights.get(key) || 0) + 1)
      }
    }

    const preferredOrder = [
      "pitcherName",
      "teamName",
      "opponent",
      "throwingHand",
      "era",
      "whip",
      "fip",
      "xfip",
      "xera",
      "strikeoutRate",
      "walkRate",
      "strikeoutMinusWalkRate",
      "weightedOnBaseAverage",
      "weightedRunsCreatedPlus",
      "ops",
      "runsPerGame"
    ]

    const ranked = [...keyWeights.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key)
    const merged = [
      ...preferredOrder.filter((key) => ranked.includes(key)),
      ...ranked.filter((key) => !preferredOrder.includes(key))
    ]

    return merged.slice(0, MAX_COLUMNS)
  }, [decoratedRows, records, sectionKey])

  const handleSort = (column) => {
    setSort((current) => {
      if (current.key !== column) {
        return {
          key: column,
          direction: "asc"
        }
      }

      return {
        key: column,
        direction: current.direction === "asc" ? "desc" : "asc"
      }
    })
  }

  return (
    <section className="shellCard statsSection">
      <div className="statsSection__header">
        <h2>{title}</h2>
        <span className="tag tag--muted">{section?.recordCount || 0} records</span>
      </div>

      {!section?.data && <p className="notice">No cached data found for this section yet.</p>}

      {section?.data && columns.length === 0 && (
        <p className="notice">This section exists, but no displayable fields were found.</p>
      )}

      {section?.data && columns.length > 0 && visibleRows.length === 0 && (
        <p className="notice">No rows matched your current filter.</p>
      )}

      {section?.data && columns.length > 0 && visibleRows.length > 0 && (
        <div className="tableWrap">
          <table className="statsTable">
            <thead>
              <tr>
                {sectionKey !== "pitchers" && <th scope="col">Record</th>}
                {columns.map((column) => (
                  <th
                    scope="col"
                    key={typeof column === "string" ? column : column.key}
                    className={sectionKey === "pitchers" ? `statsTable__header statsTable__header--${column.align || "left"}` : ""}
                  >
                    <button
                      type="button"
                      className={`sortButton${sectionKey === "pitchers" ? " sortButton--dashboard" : ""}`}
                      onClick={() => handleSort(typeof column === "string" ? column : column.key)}
                    >
                      {typeof column === "string" ? column : column.label}
                      {sort.key === (typeof column === "string" ? column : column.key) ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.__id}>
                  {sectionKey !== "pitchers" && <td>{row.__label}</td>}
                  {columns.map((column) => (
                    <td
                      key={`${row.__id}-${typeof column === "string" ? column : column.key}`}
                      className={sectionKey === "pitchers" ? `statsTable__cell statsTable__cell--${column.align || "left"}` : ""}
                    >
                      {sectionKey === "pitchers"
                        ? formatStatValue(row[column.key], column.format)
                        : toDisplayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function StatsPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)
  const [state, setState] = useState({
    loading: true,
    error: "",
    sections: {},
    pitchersFetched: null,
    pitchersSaved: null,
    todaySlateFetchedAt: null
  })

  useEffect(() => {
    if (!router.isReady) {
      return
    }

    const tabFromQuery = Array.isArray(router.query?.tab) ? router.query.tab[0] : router.query?.tab
    setActiveTab(normalizeTabKey(tabFromQuery))
  }, [router.isReady, router.query?.tab])

  const setTab = (tabKey) => {
    const nextTab = normalizeTabKey(tabKey)

    setActiveTab(nextTab)
    setQuery("")

    const nextQuery = {
      ...router.query,
      tab: nextTab
    }

    router.replace(
      {
        pathname: router.pathname,
        query: nextQuery
      },
      undefined,
      { shallow: true, scroll: false }
    )
  }

  useEffect(() => {
    let active = true

    fetch("/api/stats")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Stats cache is currently unavailable.")
        }

        const payload = await response.json()

        if (!active) {
          return
        }

        setState({
          loading: false,
          error: "",
          sections: payload?.sections || {},
          pitchersFetched: Number.isFinite(Number(payload?.pitchersFetched)) ? Number(payload?.pitchersFetched) : null,
          pitchersSaved: Number.isFinite(Number(payload?.pitchersSaved)) ? Number(payload?.pitchersSaved) : null,
          todaySlateFetchedAt: payload?.todaySlateFetchedAt || null
        })
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Stats cache is currently unavailable.",
          sections: {},
          pitchersFetched: null,
          pitchersSaved: null,
          todaySlateFetchedAt: null
        })
      })

    return () => {
      active = false
    }
  }, [])

  const hasAnySection = useMemo(
    () => SECTION_ORDER.some(({ key }) => Boolean(state.sections?.[key]?.data)),
    [state.sections]
  )
  const activeSection = SECTION_ORDER.find((section) => section.key === activeTab) || SECTION_ORDER[0]

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST"
      })
    } catch (logoutError) {
      // Allow redirect even when logout network calls fail.
    } finally {
      await router.push("/login")
    }
  }

  return (
    <main className="dashboard">
      <section className="topNav shellCard">
        <div className="topNav__masthead">
          <h1 className="topNav__title">MLB Betting Edges</h1>
          <button
            type="button"
            className="actionButton actionButton--button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </section>

      <nav className="actionRow" aria-label="Dashboard sections">
        <button
          type="button"
          className="actionButton actionButton--button"
          onClick={() => router.push("/")}
        >
          Today&apos;s Games
        </button>
        <button
          type="button"
          className="actionButton actionButton--button actionButton--active"
          aria-current="page"
        >
          Stats
        </button>
      </nav>

      <section className="shellCard statsOverview">
        <p className="eyebrow">Model input inspection</p>
        <p className="statsOverview__copy">Read-only view of the latest cached starting pitcher, bullpen, and offense inputs used by the model.</p>
        <p className="statsOverview__copy statsOverview__copy--meta">
          Today&apos;s slate loaded at: {formatSlateLoadedAt(state.todaySlateFetchedAt)}
        </p>
        <div className="statsOverview__grid">
          {SECTION_ORDER.map((section) => {
            const details = state.sections?.[section.key]
            const isActive = section.key === activeTab
            const isPitcherSection = section.key === "pitchers"

            return (
              <button
                type="button"
                className={`statCard${isActive ? " statCard--active" : ""}`}
                key={section.key}
                onClick={() => setTab(section.key)}
                aria-pressed={isActive}
              >
                <span className="statCard__label">{section.title}</span>
                <strong className="statCard__value">
                  {isPitcherSection
                    ? renderPitcherPipelineText(state)
                    : `${details?.recordCount || 0} ${section.recordLabel}`}
                </strong>
                <span className="statCard__meta">Updated: {formatDateTime(details?.meta?.lastUpdatedAt)}</span>
              </button>
            )
          })}
        </div>
      </section>

      {state.loading && <p className="notice notice--info">Loading cached stats from Redis…</p>}
      {!state.loading && state.error && <p className="notice notice--error">{state.error}</p>}

      {!state.loading && !state.error && (
        <section className="shellCard boardSection">
          <div className="searchRow">
            <label htmlFor="stats-query" className="filterControl__label">Search by pitcher/team/metric</label>
            <input
              id="stats-query"
              className="searchInput"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter rows in ${activeSection.title}`}
            />
          </div>
        </section>
      )}

      {!state.loading && !state.error && !hasAnySection && (
        <section className="emptyState shellCard">
          <h2 className="emptyState__title">No cached stats found yet</h2>
          <p className="emptyState__copy">Run the stats pipeline to populate Redis keys: mlb:stats:pitchers, mlb:stats:bullpen, and mlb:stats:offense.</p>
        </section>
      )}

      {!state.loading && !state.error && hasAnySection && (
        <StatsSection
          key={activeSection.key}
          sectionKey={activeSection.key}
          section={state.sections?.[activeSection.key]}
          title={activeSection.title}
          query={query}
        />
      )}

      <style jsx global>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: radial-gradient(circle at top, #1f2937 0, #0f172a 42%, #020617 100%);
          color: #e2e8f0;
        }
      `}</style>
      <style jsx>{`
        .dashboard { padding: 32px 20px 64px; display: grid; gap: 18px; max-width: 1400px; margin: 0 auto; }
        .shellCard { border-radius: 18px; padding: 24px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.82); }
        .topNav { display: grid; gap: 14px; padding: 20px 24px; }
        .topNav__masthead { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .topNav__title { margin: 0; font-size: clamp(1.6rem, 3vw, 2.2rem); }
        .actionButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 132px;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.78);
          text-decoration: none;
          color: #e2e8f0;
          font-weight: 700;
          font-size: 0.9rem;
          line-height: 1.2;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }
        .actionButton:hover { transform: translateY(-1px); border-color: rgba(96, 165, 250, 0.45); background: rgba(30, 41, 59, 0.96); }
        .actionButton:focus-visible { outline: 2px solid rgba(147, 197, 253, 0.9); outline-offset: 3px; }
        .actionButton--button { font: inherit; cursor: pointer; }
        .actionButton--active { border-color: rgba(96, 165, 250, 0.9); background: rgba(30, 64, 175, 0.7); }
        .actionRow { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 8px; }
        .statsOverview { display: grid; gap: 16px; }
        .statsOverview__copy { margin: 0; color: #cbd5e1; }
        .statsOverview__copy--meta { color: #94a3b8; font-size: 0.92rem; }
        .statsOverview__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .eyebrow { margin: 0 0 8px; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.08em; color: #93c5fd; }
        .statCard {
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 12px;
          padding: 14px;
          display: grid;
          gap: 6px;
          background: rgba(15, 23, 42, 0.78);
          text-align: left;
          color: inherit;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }
        .statCard:hover { transform: translateY(-1px); border-color: rgba(96, 165, 250, 0.45); background: rgba(30, 41, 59, 0.96); }
        .statCard:focus-visible { outline: 2px solid rgba(125, 211, 252, 0.95); outline-offset: 2px; }
        .statCard--active { border-color: rgba(96, 165, 250, 0.9); background: rgba(30, 64, 175, 0.45); }
        .statCard__label { font-size: 0.86rem; color: #e2e8f0; font-weight: 700; }
        .statCard__value { font-size: 1rem; }
        .statCard__meta { font-size: 0.78rem; color: #94a3b8; }
        .notice { margin: 0; padding: 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.24); background: rgba(30, 41, 59, 0.55); }
        .notice--error { border-color: rgba(248, 113, 113, 0.45); color: #fecaca; }
        .notice--info { border-color: rgba(125, 211, 252, 0.45); color: #bfdbfe; }
        .boardSection { display: grid; gap: 10px; }
        .searchRow { display: grid; gap: 8px; }
        .searchInput { width: 100%; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.28); padding: 10px 12px; background: rgba(15, 23, 42, 0.9); color: #e2e8f0; }
        .filterControl__label { font-size: 0.86rem; color: #cbd5e1; }
        .statsSection { display: grid; gap: 12px; }
        .statsSection__header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .statsSection__header h2 { margin: 0; font-size: 1.15rem; }
        .tag { display: inline-flex; border-radius: 999px; padding: 4px 10px; font-size: 0.76rem; border: 1px solid rgba(148, 163, 184, 0.2); }
        .tag--muted { color: #cbd5e1; background: rgba(15, 23, 42, 0.5); }
        .tableWrap { width: 100%; overflow: auto; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; }
        .statsTable { width: 100%; border-collapse: collapse; min-width: 900px; }
        .statsTable th, .statsTable td { padding: 10px 14px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); text-align: left; vertical-align: middle; font-size: 0.84rem; white-space: nowrap; }
        .statsTable thead th { position: sticky; top: 0; background: rgba(15, 23, 42, 0.98); z-index: 1; border-bottom: 1px solid rgba(148, 163, 184, 0.35); }
        .statsTable__header--right, .statsTable__cell--right { text-align: right; }
        .statsTable__header--center, .statsTable__cell--center { text-align: center; }
        .sortButton--dashboard { width: 100%; display: inline-flex; justify-content: inherit; font-weight: 700; color: #dbeafe; letter-spacing: 0.01em; }
        .sortButton { border: 0; background: none; color: #bfdbfe; cursor: pointer; font: inherit; padding: 0; text-align: left; }
        .emptyState { text-align: center; }
        .emptyState__title { margin: 0 0 8px; }
        .emptyState__copy { margin: 0; color: #cbd5e1; }
        @media (max-width: 700px) {
          .dashboard { padding: 24px 14px 48px; }
          .shellCard { padding: 18px; }
          .topNav { padding: 18px; }
          .actionRow { margin-top: 0; }
        }
      `}</style>
    </main>
  )
}
