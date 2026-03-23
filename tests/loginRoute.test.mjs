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

  const req = {
    method: "POST",
    body: {
      password: "dugout"
    }
  }
  const res = createMockResponse()

  await loginHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true })
  assert.match(res.headers["Set-Cookie"], /app_session=/)
})

test("login route rejects an incorrect password", async () => {
  process.env.APP_PASSWORD = "dugout"

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
