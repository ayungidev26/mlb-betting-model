const ODDS_API_ENDPOINT = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"

// The Odds API authenticates with an apiKey query parameter, so keep URL
// creation centralized and avoid logging the full request URL anywhere else.

export function getOddsApiKey() {
  const apiKey = process.env.ODDS_API_KEY?.trim()

  if (!apiKey) {
    throw new Error("ODDS_API_KEY environment variable is required")
  }

  return apiKey
}

export function buildOddsApiUrl(apiKey = getOddsApiKey()) {
  const url = new URL(ODDS_API_ENDPOINT)

  url.searchParams.set("apiKey", apiKey)
  url.searchParams.set("regions", "us")
  url.searchParams.set("markets", "h2h")
  url.searchParams.set("oddsFormat", "american")

  return url
}

export function redactOddsApiUrl(urlLike) {
  const url = new URL(urlLike)

  if (url.searchParams.has("apiKey")) {
    url.searchParams.set("apiKey", "[redacted]")
  }

  return url.toString()
}
