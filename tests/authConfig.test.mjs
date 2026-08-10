import test from "node:test"
import assert from "node:assert/strict"

import { getMissingAuthEnvironmentVariables } from "../lib/authConfig.js"

test("auth configuration reports each missing or blank required variable", () => {
  assert.deepEqual(getMissingAuthEnvironmentVariables({}), [
    "APP_PASSWORD",
    "SESSION_SIGNING_SECRET"
  ])
  assert.deepEqual(getMissingAuthEnvironmentVariables({
    APP_PASSWORD: "dugout",
    SESSION_SIGNING_SECRET: "   "
  }), ["SESSION_SIGNING_SECRET"])
  assert.deepEqual(getMissingAuthEnvironmentVariables({
    APP_PASSWORD: "dugout",
    SESSION_SIGNING_SECRET: "independent-secret"
  }), [])
})
