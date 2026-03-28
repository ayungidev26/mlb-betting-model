import { buildPublicPageError } from "./apiErrors.js"

function normalizeEdges(edges = []) {
  return Array.isArray(edges)
    ? edges.filter((edge) => edge?.matchKey)
    : []
}

function mergeGamesWithEdges(games = [], edges = []) {
  const edgesByMatchKey = normalizeEdges(edges).reduce((map, edge) => {
    const existing = map.get(edge.matchKey)

    if (!existing || (edge.edge ?? 0) > (existing.edge ?? 0)) {
      map.set(edge.matchKey, edge)
    }

    return map
  }, new Map())

  return games.map((game) => {
    const matchedEdge = edgesByMatchKey.get(game.matchKey)

    return matchedEdge
      ? {
          ...game,
          edge: matchedEdge.edge,
          recommendedBet: matchedEdge.team,
          recommendedOdds: matchedEdge.odds,
          sportsbook: matchedEdge.sportsbook,
          sportsbookName: matchedEdge.sportsbookName || matchedEdge.sportsbook,
          bestOdds: matchedEdge.bestOdds ?? matchedEdge.odds ?? null,
          bestSportsbook: matchedEdge.bestSportsbook || matchedEdge.sportsbook || null,
          bestSportsbookName: matchedEdge.bestSportsbookName || matchedEdge.sportsbookName || matchedEdge.sportsbook || null,
          draftKingsOdds: typeof matchedEdge.draftKingsOdds === "number" ? matchedEdge.draftKingsOdds : null,
          fanDuelOdds: typeof matchedEdge.fanDuelOdds === "number" ? matchedEdge.fanDuelOdds : null,
          impliedProbability: matchedEdge.impliedProbability,
          recommendation: matchedEdge.recommendation || "Bet"
        }
      : {
          ...game,
          edge: null,
          recommendedBet: null,
          recommendedOdds: null,
          sportsbook: null,
          sportsbookName: null,
          bestOdds: null,
          bestSportsbook: null,
          bestSportsbookName: null,
          draftKingsOdds: null,
          fanDuelOdds: null,
          impliedProbability: null,
          recommendation: "Pass"
        }
  })
}

function sortGamesByEdge(games = []) {
  return [...games].sort((leftGame, rightGame) => {
    const leftEdge = typeof leftGame?.edge === "number" ? leftGame.edge : Number.NEGATIVE_INFINITY
    const rightEdge = typeof rightGame?.edge === "number" ? rightGame.edge : Number.NEGATIVE_INFINITY

    return rightEdge - leftEdge
  })
}

export function buildHomePageViewModel({ predictions, edges = [] } = {}) {
  const cachedPredictions = Array.isArray(predictions)
    ? predictions.filter(Boolean)
    : []
  const games = sortGamesByEdge(mergeGamesWithEdges(cachedPredictions, edges))
  const recommendedBets = games.filter((game) => typeof game.edge === "number").length

  return {
    games,
    summary: {
      predictionsCreated: cachedPredictions.length,
      recommendedBets,
      message: cachedPredictions.length > 0
        ? "Showing cached predictions."
        : "No cached predictions are available yet."
    }
  }
}

export async function buildHomePageProps(loadPageData) {
  try {
    const viewModel = buildHomePageViewModel(await loadPageData())

    return {
      props: {
        ...viewModel,
        error: ""
      }
    }
  } catch (error) {
    return {
      props: {
        games: [],
        summary: {
          predictionsCreated: 0,
          recommendedBets: 0,
          message: "Cached predictions are currently unavailable."
        },
        error: buildPublicPageError(
          "homePageProps",
          error,
          "Cached predictions are currently unavailable."
        )
      }
    }
  }
}

export function buildPublicApiUrl(req, path) {
  const forwardedProto = req?.headers?.["x-forwarded-proto"]
  const protocol = typeof forwardedProto === "string" && forwardedProto.length > 0
    ? forwardedProto.split(",")[0].trim()
    : "http"
  const host = req?.headers?.host

  if (!host) {
    throw new Error("Missing host header for public API request")
  }

  return `${protocol}://${host}${path}`
}

async function loadPublicJson(req, path, fetchImpl = fetch) {
  const response = await fetchImpl(buildPublicApiUrl(req, path))

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }

  return response.json()
}

export async function loadCachedPredictionsFromApi(req, fetchImpl = fetch) {
  const payload = await loadPublicJson(req, "/api/predictions", fetchImpl)

  return payload.predictions
}

export async function loadCachedEdgesFromApi(req, fetchImpl = fetch) {
  const payload = await loadPublicJson(req, "/api/edges", fetchImpl)

  return payload.edges
}

export async function loadHomePageData(req, fetchImpl = fetch) {
  const [predictions, edges] = await Promise.all([
    loadCachedPredictionsFromApi(req, fetchImpl),
    loadCachedEdgesFromApi(req, fetchImpl)
  ])

  return {
    predictions,
    edges
  }
}
