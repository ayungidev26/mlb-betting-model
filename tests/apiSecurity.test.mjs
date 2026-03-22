import test from "node:test"
import assert from "node:assert/strict"

import {
  requireCronRouteAccess,
  requireOperationalRouteAccess
} from "../lib/apiSecurity.js"

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    }
  }
}

test("requireOperationalRouteAccess rejects non-POST requests", () => {
  process.env.ADMIN_API_SECRET = "top-secret"

  const req = {
    method: "GET",
    headers: {}
  }
  const res = createMockResponse()

  const allowed = requireOperationalRouteAccess(req, res)

  assert.equal(allowed, false)
  assert.equal(res.statusCode, 405)
  assert.deepEqual(res.headers.Allow, ["POST"])
  assert.match(res.body.error, /GET/)
})

test("requireOperationalRouteAccess rejects missing bearer token", () => {
  process.env.ADMIN_API_SECRET = "top-secret"

  const req = {
    method: "POST",
    headers: {}
  }
  const res = createMockResponse()

  const allowed = requireOperationalRouteAccess(req, res)

  assert.equal(allowed, false)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error, "Missing Authorization header")
})

test("requireOperationalRouteAccess rejects invalid bearer tokens", () => {
  process.env.ADMIN_API_SECRET = "top-secret"

  const req = {
    method: "POST",
    headers: {
      authorization: "Bearer wrong-secret"
    }
  }
  const res = createMockResponse()

  const allowed = requireOperationalRouteAccess(req, res)

  assert.equal(allowed, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, "Invalid bearer token")
})

test("requireOperationalRouteAccess accepts the configured bearer token", () => {
  process.env.ADMIN_API_SECRET = "top-secret"

  const req = {
    method: "POST",
    headers: {
      authorization: "Bearer top-secret"
    }
  }
  const res = createMockResponse()

  const allowed = requireOperationalRouteAccess(req, res)

  assert.equal(allowed, true)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, null)
})


test("requireCronRouteAccess rejects requests when CRON_SECRET is missing", () => {
  delete process.env.CRON_SECRET

  const req = {
    method: "GET",
    headers: {
      authorization: "Bearer missing-secret"
    }
  }
  const res = createMockResponse()

  const allowed = requireCronRouteAccess(req, res)

  assert.equal(allowed, false)
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.error, "CRON_SECRET is not configured")
})

test("requireCronRouteAccess accepts the configured cron bearer token", () => {
  process.env.CRON_SECRET = "cron-secret"

  const req = {
    method: "GET",
    headers: {
      authorization: "Bearer cron-secret"
    }
  }
  const res = createMockResponse()

  const allowed = requireCronRouteAccess(req, res)

  assert.equal(allowed, true)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, null)
})
