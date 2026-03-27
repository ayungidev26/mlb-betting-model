import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

const SECTION_ORDER = [
  { key: "pitchers", title: "Starting Pitchers", recordLabel: "Pitchers" },
  { key: "bullpen", title: "Bullpens", recordLabel: "Teams" },
  { key: "offense", title: "Offense", recordLabel: "Teams" }
]

const MAX_COLUMNS = 14

function formatDateTime(value) {
  if (!value) {
    return "N/A"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
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
    return "—"
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  return String(value)
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

function StatsSection({ title, sectionKey, section, query }) {
  const records = useMemo(
    () => normalizeSectionRecords(section, sectionKey),
    [section, sectionKey]
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

    const filtered = normalizedQuery
      ? records.filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(normalizedQuery)))
      : records

    return sortRows(filtered, sort.key, sort.direction)
  }, [records, query, sort])

  const columns = useMemo(() => {
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
  }, [records])

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
                <th scope="col">Record</th>
                {columns.map((column) => (
                  <th scope="col" key={column}>
                    <button type="button" className="sortButton" onClick={() => handleSort(column)}>
                      {column}
                      {sort.key === column ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.__id}>
                  <td>{row.__label}</td>
                  {columns.map((column) => (
                    <td key={`${row.__id}-${column}`}>{toDisplayValue(row[column])}</td>
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
  const [query, setQuery] = useState("")
  const [state, setState] = useState({
    loading: true,
    error: "",
    sections: {}
  })

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
          sections: payload?.sections || {}
        })
      })
      .catch((error) => {
        if (!active) {
          return
        }

        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Stats cache is currently unavailable.",
          sections: {}
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

  return (
    <main className="dashboard">
      <section className="hero shellCard">
        <div className="hero__content">
          <nav className="viewTabs" aria-label="Primary">
            <Link href="/" className="viewTabs__link">Dashboard</Link>
            <Link href="/stats" className="viewTabs__link viewTabs__link--active" aria-current="page">Stats</Link>
          </nav>
          <p className="eyebrow">Model input inspection</p>
          <h1>Stats</h1>
          <p className="hero__copy">Read-only view of the latest cached starting pitcher, bullpen, and offense inputs used by the model.</p>
        </div>

        <div className="hero__stats">
          {SECTION_ORDER.map((section) => {
            const details = state.sections?.[section.key]

            return (
              <div className="statCard" key={section.key}>
                <span className="statCard__label">{section.title}</span>
                <strong className="statCard__value">{details?.recordCount || 0} {section.recordLabel}</strong>
                <span className="statCard__meta">Updated: {formatDateTime(details?.meta?.lastUpdatedAt)}</span>
              </div>
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
              placeholder="Filter rows across all sections"
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

      {!state.loading && !state.error && SECTION_ORDER.map((section) => (
        <StatsSection
          key={section.key}
          sectionKey={section.key}
          section={state.sections?.[section.key]}
          title={section.title}
          query={query}
        />
      ))}

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
        .hero { display: grid; gap: 16px; }
        .hero__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
        .hero__copy { margin: 0; color: #cbd5e1; }
        .eyebrow { margin: 0 0 8px; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.08em; color: #93c5fd; }
        h1 { margin: 0 0 8px; }
        .viewTabs { display: inline-flex; gap: 8px; padding: 6px; border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 999px; background: rgba(15, 23, 42, 0.65); margin-bottom: 12px; }
        .viewTabs__link { padding: 8px 14px; border-radius: 999px; text-decoration: none; color: #cbd5e1; font-weight: 600; font-size: 0.92rem; }
        .viewTabs__link--active { color: #0f172a; background: linear-gradient(135deg, #93c5fd, #60a5fa); }
        .statCard { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; padding: 12px; display: grid; gap: 6px; background: rgba(15, 23, 42, 0.7); }
        .statCard__label { font-size: 0.8rem; color: #93c5fd; }
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
        .statsTable th, .statsTable td { padding: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); text-align: left; vertical-align: top; font-size: 0.84rem; }
        .statsTable thead th { position: sticky; top: 0; background: rgba(15, 23, 42, 0.98); z-index: 1; }
        .sortButton { border: 0; background: none; color: #bfdbfe; cursor: pointer; font: inherit; padding: 0; text-align: left; }
        .emptyState { text-align: center; }
        .emptyState__title { margin: 0 0 8px; }
        .emptyState__copy { margin: 0; color: #cbd5e1; }
        @media (max-width: 700px) {
          .dashboard { padding: 24px 14px 48px; }
          .shellCard { padding: 18px; }
        }
      `}</style>
    </main>
  )
}
