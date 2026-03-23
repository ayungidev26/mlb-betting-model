const AUTH_COOKIE_NAME = "app_session"
const AUTH_SESSION_TTL_SECONDS = 60 * 5
const AUTH_SESSION_TTL_MS = AUTH_SESSION_TTL_SECONDS * 1000
const SESSION_SALT = "mlb-betting-model:app-auth"

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function normalizeSessionTimestamp(value) {
  const issuedAt = Number.parseInt(value, 10)

  return Number.isFinite(issuedAt) && issuedAt > 0
    ? issuedAt
    : null
}

export async function createSessionToken(password, issuedAt = Date.now()) {
  if (!password) {
    return ""
  }

  const normalizedIssuedAt = normalizeSessionTimestamp(issuedAt)

  if (!normalizedIssuedAt) {
    return ""
  }

  const payload = new TextEncoder().encode(`${SESSION_SALT}:${password}:${normalizedIssuedAt}`)
  const digest = await crypto.subtle.digest("SHA-256", payload)

  return `${normalizedIssuedAt}.${bufferToHex(digest)}`
}

export async function isValidPassword(candidatePassword, configuredPassword) {
  if (!candidatePassword || !configuredPassword) {
    return false
  }

  const [candidateToken, configuredToken] = await Promise.all([
    createSessionToken(candidatePassword, 1),
    createSessionToken(configuredPassword, 1)
  ])

  return candidateToken === configuredToken
}

export function getSessionIssuedAt(sessionToken) {
  if (!sessionToken) {
    return null
  }

  const [issuedAtValue] = sessionToken.split(".", 2)

  return normalizeSessionTimestamp(issuedAtValue)
}

export function getSessionExpirationTimestamp(sessionToken) {
  const issuedAt = getSessionIssuedAt(sessionToken)

  return issuedAt ? issuedAt + AUTH_SESSION_TTL_MS : null
}

export async function isValidSession(sessionToken, configuredPassword, now = Date.now()) {
  if (!sessionToken || !configuredPassword) {
    return false
  }

  const issuedAt = getSessionIssuedAt(sessionToken)

  if (!issuedAt) {
    return false
  }

  const expiresAt = issuedAt + AUTH_SESSION_TTL_MS

  if (!Number.isFinite(now) || now >= expiresAt) {
    return false
  }

  const expectedToken = await createSessionToken(configuredPassword, issuedAt)

  return sessionToken === expectedToken
}

export function buildSessionCookie(token) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : ""

  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_SESSION_TTL_SECONDS}${secureFlag}`
}

export function buildLogoutCookie() {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : ""

  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
}

export function readSessionCookie(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.slice(AUTH_COOKIE_NAME.length + 1) || ""
}

export {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_MS,
  AUTH_SESSION_TTL_SECONDS
}
