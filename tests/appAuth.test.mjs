import test from "node:test"
import assert from "node:assert/strict"

import {
  AUTH_COOKIE_NAME,
  buildLogoutCookie,
  buildSessionCookie,
  createSessionToken,
  isValidPassword,
  isValidSession,
  readSessionCookie
} from "../lib/appAuth.js"

test("app auth helpers validate passwords and session tokens", async () => {
  const password = "clubhouse"
  const token = await createSessionToken(password)

  assert.equal(typeof token, "string")
  assert.equal(token.length, 64)
  assert.equal(await isValidPassword("clubhouse", password), true)
  assert.equal(await isValidPassword("wrong", password), false)
  assert.equal(await isValidSession(token, password), true)
  assert.equal(await isValidSession("bad-token", password), false)
})

test("app auth helpers build and clear cookies", async () => {
  const token = await createSessionToken("clubhouse")
  const cookie = buildSessionCookie(token)

  assert.match(cookie, new RegExp(`^${AUTH_COOKIE_NAME}=`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.equal(readSessionCookie(`${cookie}; theme=dark`), token)
  assert.match(buildLogoutCookie(), /Max-Age=0/)
})
