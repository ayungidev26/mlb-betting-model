import test from "node:test"
import assert from "node:assert/strict"

import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_MS,
  AUTH_SESSION_TTL_SECONDS,
  buildLogoutCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionExpirationTimestamp,
  getSessionIssuedAt,
  isValidPassword,
  isValidSession,
  readSessionCookie
} from "../lib/appAuth.js"

test("app auth helpers validate passwords and session tokens", async () => {
  const password = "clubhouse"
  const signingSecret = "test-only-independent-signing-secret-with-high-entropy"
  const issuedAt = Date.UTC(2026, 2, 23, 12, 0, 0)
  const token = await createSessionToken(signingSecret, issuedAt)

  assert.equal(typeof token, "string")
  assert.equal(token.split(".")[0], "v1")
  assert.equal(getSessionIssuedAt(token), issuedAt)
  assert.equal(getSessionExpirationTimestamp(token), issuedAt + AUTH_SESSION_TTL_MS)
  assert.equal(await isValidPassword("clubhouse", password), true)
  assert.equal(await isValidPassword("wrong", password), false)
  assert.equal(await isValidSession(token, signingSecret, issuedAt + 1), true)
  assert.equal(await isValidSession(`${token.slice(0, -1)}x`, signingSecret, issuedAt + 1), false)
  assert.equal(await isValidSession(token, "a-different-signing-secret", issuedAt + 1), false)
  assert.equal(await isValidSession(token, signingSecret, issuedAt + AUTH_SESSION_TTL_MS), false)
})

test("app auth helpers build and clear cookies", async () => {
  const token = await createSessionToken("clubhouse", 1)
  const cookie = buildSessionCookie(token)

  assert.match(cookie, new RegExp(`^${AUTH_COOKIE_NAME}=`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, new RegExp(`Max-Age=${AUTH_SESSION_TTL_SECONDS}`))
  assert.equal(readSessionCookie(`${cookie}; theme=dark`), token)
  assert.match(buildLogoutCookie(), /Max-Age=0/)
})

test("production cookies are secure", () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = "production"
  try {
    assert.match(buildSessionCookie("token"), /; Secure/)
    assert.match(buildLogoutCookie(), /; Secure/)
  } finally {
    process.env.NODE_ENV = previousNodeEnv
  }
})
