const AUTH_COOKIE_NAME = "app_session"
const AUTH_SESSION_TTL_SECONDS = 60 * 5
const AUTH_SESSION_TTL_MS = AUTH_SESSION_TTL_SECONDS * 1000
const SESSION_VERSION = "v1"

function bufferToBase64Url(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer))
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function normalizeSessionTimestamp(value) {
  const issuedAt = Number.parseInt(value, 10)
  return Number.isFinite(issuedAt) && issuedAt > 0 ? issuedAt : null
}

async function sign(payload, signingSecret) {
  if (!signingSecret) return ""
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return bufferToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))
}

function timingSafeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let difference = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0)
  }
  return difference === 0
}

export async function createSessionToken(signingSecret, issuedAt = Date.now()) {
  const normalizedIssuedAt = normalizeSessionTimestamp(issuedAt)
  if (!signingSecret || !normalizedIssuedAt) return ""
  const payload = `${SESSION_VERSION}.${normalizedIssuedAt}`
  return `${payload}.${await sign(payload, signingSecret)}`
}

export async function isValidPassword(candidatePassword, configuredPassword) {
  if (!candidatePassword || !configuredPassword) return false
  return timingSafeEqual(candidatePassword, configuredPassword)
}

export function getSessionIssuedAt(sessionToken) {
  if (!sessionToken) return null
  const [version, issuedAtValue] = sessionToken.split(".", 3)
  return version === SESSION_VERSION ? normalizeSessionTimestamp(issuedAtValue) : null
}

export function getSessionExpirationTimestamp(sessionToken) {
  const issuedAt = getSessionIssuedAt(sessionToken)
  return issuedAt ? issuedAt + AUTH_SESSION_TTL_MS : null
}

export async function isValidSession(sessionToken, signingSecret, now = Date.now()) {
  if (!sessionToken || !signingSecret) return false
  const parts = sessionToken.split(".")
  if (parts.length !== 3) return false
  const issuedAt = getSessionIssuedAt(sessionToken)
  if (!issuedAt || !Number.isFinite(now) || now < issuedAt || now >= issuedAt + AUTH_SESSION_TTL_MS) return false
  const payload = `${parts[0]}.${parts[1]}`
  return timingSafeEqual(parts[2], await sign(payload, signingSecret))
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
  return cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.slice(AUTH_COOKIE_NAME.length + 1) || ""
}

export { AUTH_COOKIE_NAME, AUTH_SESSION_TTL_MS, AUTH_SESSION_TTL_SECONDS }
