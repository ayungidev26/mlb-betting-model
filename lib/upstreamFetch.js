const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_RETRY_COUNT = 2
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const JSON_CONTENT_TYPE_PATTERN = /(^|\s|;)(application\/json|application\/[^;\s]+\+json)(\s*;|$)/i

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function isJsonContentType(contentType) {
  return JSON_CONTENT_TYPE_PATTERN.test(contentType)
}

function isRetryableError(error) {
  return error?.name === "AbortError" || error?.code === "UPSTREAM_RETRYABLE"
}

function buildRetryDelay(attempt) {
  return Math.min(250 * (2 ** attempt), 2000)
}

function parseRetryAfterSeconds(headerValue) {
  const retryAfter = Number.parseInt(headerValue, 10)

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter
  }

  return null
}

export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRY_COUNT,
    headers = {},
    ...fetchOptions
  } = options

  const normalizedHeaders = {
    Accept: "application/json",
    ...headers
  }

  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        ...fetchOptions,
        headers: normalizedHeaders,
        signal: controller.signal
      })

      const contentType = response.headers.get("content-type") || ""

      if (!response.ok) {
        const error = new Error(`Upstream request failed with status ${response.status}`)
        error.code = RETRYABLE_STATUS_CODES.has(response.status)
          ? "UPSTREAM_RETRYABLE"
          : "UPSTREAM_HTTP_ERROR"
        error.status = response.status
        error.retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"))
        throw error
      }

      if (!isJsonContentType(contentType)) {
        const error = new Error(`Upstream response was not JSON (received ${contentType || "unknown content type"})`)
        error.code = "UPSTREAM_INVALID_CONTENT_TYPE"
        throw error
      }

      return await response.json()
    } catch (error) {
      lastError = error

      if (attempt === retries || !isRetryableError(error)) {
        throw error
      }

      const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds)
        ? error.retryAfterSeconds
        : null
      const delayMs = retryAfterSeconds !== null
        ? Math.min(retryAfterSeconds * 1000, 5000)
        : buildRetryDelay(attempt)

      await delay(delayMs)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw lastError || new Error("Upstream request failed")
}
