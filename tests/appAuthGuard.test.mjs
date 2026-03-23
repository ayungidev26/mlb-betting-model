import test from "node:test"
import assert from "node:assert/strict"

import { buildLoginRedirectPath } from "../lib/appAuthGuard.js"

test("app auth guard sends the homepage to the login route", () => {
  assert.equal(buildLoginRedirectPath("/", ""), "/login")
})

test("app auth guard preserves a nested destination in the login redirect", () => {
  assert.equal(
    buildLoginRedirectPath("/reports", "?date=2026-03-23"),
    "/login?next=%2Freports%3Fdate%3D2026-03-23"
  )
})
