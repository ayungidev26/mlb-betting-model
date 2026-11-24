export const STAT_KINDS = ["pitchers", "bullpen", "offense"]

export function parseStatsSeason(value) {
  return (typeof value === "number" || typeof value === "string") && /^(19|20)\d{2}$/.test(String(value))
    ? Number(value) : null
}

export function getStatsSeason(metadata) {
  const date = metadata?.dataLastUpdatedAt || metadata?.dateKey || metadata?.lastUpdatedAt
  return parseStatsSeason(metadata?.season) ?? (typeof date === "string" ? parseStatsSeason(date.slice(0, 4)) : null)
}

export function getSeasonStatsKey(kind, season) {
  return `mlb:stats:${kind}:season:${season}`
}

export async function publishSeasonStats(redisClient, { kind, candidate, metadata }) {
  const key = `mlb:stats:${kind}`
  const season = getStatsSeason(metadata)
  if (!season) throw new Error("Stats publication requires a season")

  const [previousData, previousMeta] = await Promise.all([
    redisClient.get(key), redisClient.get(`${key}:meta`)
  ])
  const previousSeason = getStatsSeason(previousMeta)
  if (previousSeason && previousSeason !== season && previousData) {
    await redisClient.set(getSeasonStatsKey(kind, previousSeason), {
      data: previousData, meta: { ...previousMeta, season: previousSeason }
    }, { nx: true })
  }

  const meta = { ...metadata, season }
  await redisClient.set(getSeasonStatsKey(kind, season), { data: candidate, meta })
  if (previousSeason && previousSeason > season) return

  if (typeof redisClient.pipeline === "function") {
    await redisClient.pipeline().set(key, candidate).set(`${key}:meta`, meta).exec()
  } else {
    await redisClient.set(key, candidate)
    await redisClient.set(`${key}:meta`, meta)
  }
}

export async function loadStatsSeason(redisClient, requestedSeason, currentSeason) {
  const latestMetadata = await Promise.all(STAT_KINDS.map(kind => redisClient.get(`mlb:stats:${kind}:meta`)))
  const latestSeasons = latestMetadata.filter(meta => meta?.records !== 0).map(getStatsSeason).filter(Boolean)
  const season = requestedSeason ?? (latestSeasons.length ? Math.max(...latestSeasons) : currentSeason)
  const seasons = [...new Set([season, ...latestSeasons])]
  // Season selection starts with the first season tracked by this app.
  for (let year = currentSeason; year >= 2026; year--) {
    if (!seasons.includes(year)) seasons.push(year)
  }

  const entries = await Promise.all(STAT_KINDS.map(async (kind, index) => {
    const key = `mlb:stats:${kind}`
    const metaKey = `${key}:meta`
    const archiveKey = getSeasonStatsKey(kind, season)
    let snapshot = await redisClient.get(archiveKey)
    const legacyMeta = latestMetadata[index]
    if (!snapshot && getStatsSeason(legacyMeta) === season) {
      const legacyData = await redisClient.get(key)
      // A rollover archives the old season before it replaces the current data.
      snapshot = await redisClient.get(archiveKey) ?? { data: legacyData, meta: legacyMeta }
    }
    const { data = null, meta = null } = getStatsSeason(snapshot?.meta) === season ? snapshot : {}
    const records = kind === "pitchers" && data?.byId ? data.byId : data
    const recordCount = records && typeof records === "object" ? Object.keys(records).length : 0
    return [kind, {
      key,
      metaKey,
      data,
      meta: meta ? { ...meta, season } : null,
      recordCount,
      available: recordCount > 0
    }]
  }))
  const sections = Object.fromEntries(entries)
  const pitcherMeta = sections.pitchers.meta

  return {
    season,
    seasons: seasons.sort((a, b) => b - a),
    sections,
    pitchersFetched: pitcherMeta?.pitchersFetched ?? pitcherMeta?.fetchedPitchers ?? 0,
    pitchersSaved: pitcherMeta?.pitchersSaved ?? pitcherMeta?.savedPitchers ?? 0,
    summary: {
      availableSections: entries.filter(([, section]) => section.available).length,
      generatedAt: new Date().toISOString()
    }
  }
}
