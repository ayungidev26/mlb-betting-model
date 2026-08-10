import test from "node:test"
import assert from "node:assert/strict"

import loginHandler from "../pages/api/login.js"

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

test("login route sets a session cookie for a correct password", async () => {
  process.env.APP_PASSWORD = "dugout"
  process.env.SESSION_SIGNING_SECRET = "test-only-independent-session-signing-secret"

  const req = {
    method: "POST",
    body: {
      password: "dugout"
    }
  }
  const res = createMockResponse()

  await loginHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(typeof res.body.sessionExpiresAt, "number")
  assert.match(res.headers["Set-Cookie"], /app_session=/)
})

test("login route rejects an incorrect password", async () => {
  process.env.APP_PASSWORD = "dugout"
  process.env.SESSION_SIGNING_SECRET = "test-only-independent-session-signing-secret"

  const req = {
    method: "POST",
    body: {
      password: "bullpen"
    }
  }
  const res = createMockResponse()

  await loginHandler(req, res)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { error: "Incorrect password" })
  assert.match(res.headers["Set-Cookie"], /Max-Age=0/)
})

test("login route reports missing APP_PASSWORD configuration", async () => {
  delete process.env.APP_PASSWORD
  process.env.SESSION_SIGNING_SECRET = "test-only-independent-session-signing-secret"

  const req = {
    method: "POST",
    body: {
      password: "dugout"
    }
  }
  const res = createMockResponse()

  await loginHandler(req, res)

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, {
    error: "Authentication is not configured",
    missing: ["APP_PASSWORD"]
  })
})

test("login route reports missing session signing configuration", async () => {
  process.env.APP_PASSWORD = "dugout"
  delete process.env.SESSION_SIGNING_SECRET

  const req = {
    method: "POST",
    body: {
      password: "dugout"
    }
  }
  const res = createMockResponse()

  await loginHandler(req, res)

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, {
    error: "Authentication is not configured",
    missing: ["SESSION_SIGNING_SECRET"]
  })
})
