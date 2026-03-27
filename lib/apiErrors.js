const PUBLIC_ERROR_DEFINITIONS = [
  {
    match: (error) => error?.message === "Missing predictions or odds data",
    statusCode: 503,
    code: "UPSTREAM_DATA_UNAVAILABLE",
    message: "Upstream data unavailable"
  },
  {
    match: (error) => error?.message === "Team ratings not found",
    statusCode: 503,
    code: "UPSTREAM_DATA_UNAVAILABLE",
    message: "Upstream data unavailable"
  },
  {
    match: (error) => typeof error?.message === "string" && error.message.startsWith("Stats cache missing"),
    statusCode: 503,
    code: "STATS_PIPELINE_REQUIRED",
    message: "Stats pipeline must run before model execution"
  },
  {
    match: (error) => error?.message === "No historical games found",
    statusCode: 400,
    code: "HISTORICAL_DATA_UNAVAILABLE",
    message: "Historical data unavailable"
  }
]

function getErrorMessage(error) {
  if (typeof error?.message === "string") {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error"
}

function getPublicError(error) {
  return PUBLIC_ERROR_DEFINITIONS.find(({ match }) => match(error)) || null
}

function buildLogDetails(error, context = {}) {
  const details = {
    ...context,
    errorName: typeof error?.name === "string" ? error.name : "Error",
    errorMessage: getErrorMessage(error)
  }

  if (typeof error?.stack === "string") {
    details.errorStack = error.stack
      .split("\n")
      .slice(0, 5)
      .join("\n")
  }

  return details
}

export function logServerError(route, error, context = {}) {
  console.error(`[${route}] request failed`, buildLogDetails(error, context))
}

export function sendRouteError(res, route, error, context = {}) {
  const publicError = getPublicError(error)

  logServerError(route, error, {
    publicCode: publicError?.code || "INTERNAL_SERVER_ERROR",
    ...context
  })

  const statusCode = publicError?.statusCode || 500
  const code = publicError?.code || "INTERNAL_SERVER_ERROR"
  const message = publicError?.message || "Internal server error"

  return res.status(statusCode).json({
    error: message,
    code
  })
}

export function buildPublicPageError(route, error, fallbackMessage = "Something went wrong") {
  logServerError(route, error, {
    publicCode: "INTERNAL_PAGE_ERROR"
  })

  return fallbackMessage
}
