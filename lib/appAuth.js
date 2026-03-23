const AUTH_COOKIE_NAME = "app_session"
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const SESSION_SALT = "mlb-betting-model:app-auth"

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function createSessionToken(password) {
  if (!password) {
    return ""
  }

  const payload = new TextEncoder().encode(`${SESSION_SALT}:${password}`)
  const digest = await crypto.subtle.digest("SHA-256", payload)

  return bufferToHex(digest)
}

export async function isValidPassword(candidatePassword, configuredPassword) {
  if (!candidatePassword || !configuredPassword) {
    return false
  }

  const [candidateToken, configuredToken] = await Promise.all([
    createSessionToken(candidatePassword),
    createSessionToken(configuredPassword)
  ])

  return candidateToken === configuredToken
}

export async function isValidSession(sessionToken, configuredPassword) {
  if (!sessionToken || !configuredPassword) {
    return false
  }

  const expectedToken = await createSessionToken(configuredPassword)

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
  AUTH_SESSION_TTL_SECONDS
}
