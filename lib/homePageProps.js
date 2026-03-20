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
        error: error.message || "Failed to load cached predictions"
      }
    }
  }
}
