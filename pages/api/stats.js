import { redis } from "../../lib/upstash.js"

const STAT_SECTIONS = {
  pitchers: {
    key: "mlb:stats:pitchers",
    metaKey: "mlb:stats:pitchers:meta"
  },
  bullpen: {
    key: "mlb:stats:bullpen",
    metaKey: "mlb:stats:bullpen:meta"
  },
  offense: {
    key: "mlb:stats:offense",
    metaKey: "mlb:stats:offense:meta"
  }
}

const TODAY_GAMES_META_KEY = "mlb:games:today:meta"

function getRecordCount(data) {
  if (Array.isArray(data)) {
    return data.length
  }

  if (data && typeof data === "object") {
    return Object.keys(data).length
  }

  return 0
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
  }

  try {
    const gamesMetaPromise = redis.get(TODAY_GAMES_META_KEY)
    const sectionEntries = Object.entries(STAT_SECTIONS)
    const sectionValues = await Promise.all(
      sectionEntries.map(async ([name, section]) => {
        const [data, meta] = await Promise.all([
          redis.get(section.key),
          redis.get(section.metaKey)
        ])

        return [
          name,
          {
            key: section.key,
            metaKey: section.metaKey,
            data,
            meta,
            recordCount: getRecordCount(data),
            available: Boolean(data)
          }
        ]
      })
    )
    const gamesMeta = await gamesMetaPromise

    const sections = Object.fromEntries(sectionValues)
    const pitcherMeta = sections?.pitchers?.meta || {}
    const pitchersFetched =
      pitcherMeta.pitchersFetched ??
      pitcherMeta.fetchedPitchers ??
      0
    const pitchersSaved =
      pitcherMeta.pitchersSaved ??
      pitcherMeta.savedPitchers ??
      0

    const todaySlateFetchedAt = gamesMeta?.fetchedAt || null

    if (!todaySlateFetchedAt) {
      console.warn("[stats] missing today's games freshness metadata", {
        gamesMetaKey: TODAY_GAMES_META_KEY
      })
    }

    return res.status(200).json({
      sections,
      pitchersFetched,
      pitchersSaved,
      todaySlateFetchedAt,
      summary: {
        availableSections: sectionValues.filter(([, section]) => section.available).length,
        generatedAt: new Date().toISOString()
      }
    })
  } catch (_error) {
    return res.status(503).json({
      error: "Cached stats are currently unavailable.",
      code: "CACHE_UNAVAILABLE"
    })
  }
}
