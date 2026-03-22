import { buildPublicPageError } from "./apiErrors.js"

export async function buildHomePageProps(loadPredictions) {
  try {
    const predictions = await loadPredictions()
    const cachedPredictions = Array.isArray(predictions)
      ? predictions.filter(Boolean)
      : []

    return {
      props: {
        games: cachedPredictions.slice(0, 10),
        summary: {
          predictionsCreated: cachedPredictions.length,
          message: cachedPredictions.length > 0
            ? "Showing cached predictions."
            : "No cached predictions are available yet."
        },
        error: ""
      }
    }
  } catch (error) {
    return {
      props: {
        games: [],
        summary: {
          predictionsCreated: 0,
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

export async function loadCachedPredictionsFromApi(req, fetchImpl = fetch) {
  const response = await fetchImpl(buildPublicApiUrl(req, "/api/predictions"))

  if (!response.ok) {
    throw new Error(`Predictions API returned ${response.status}`)
  }

  const payload = await response.json()

  return payload.predictions
}
