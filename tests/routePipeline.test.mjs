import test from "node:test"
import assert from "node:assert/strict"
import {
  invokeRouteHandler,
  runRoutePipeline
} from "../lib/routePipeline.js"

function successfulHandler(body) {
  return async (req, res) => res.status(200).json({ ...body, query: req.query })
}

test("route pipeline runs ordered steps and forwards step-specific queries", async () => {
  const calls = []
  const result = await runRoutePipeline([
    {
      name: "model",
      handler: async (req, res) => {
        calls.push("model")
        return successfulHandler({ model: true })(req, res)
      }
    },
    {
      name: "odds",
      query: { refresh: "true" },
      handler: async (req, res) => {
        calls.push("odds")
        return successfulHandler({ odds: true })(req, res)
      }
    }
  ], { method: "POST", headers: { authorization: "Bearer test" } })

  assert.equal(result.ok, true)
  assert.equal(result.completedSteps, 2)
  assert.deepEqual(calls, ["model", "odds"])
  assert.deepEqual(result.steps[1].result.query, { refresh: "true" })
})

test("route pipeline stops at the first failure and preserves its response", async () => {
  let finalStepRan = false
  const result = await runRoutePipeline([
    { name: "first", handler: successfulHandler({ ok: true }) },
    {
      name: "failed",
      handler: async (req, res) => res.status(429).json({
        error: "Rate limited",
        code: "RATE_LIMITED"
      })
    },
    {
      name: "never",
      handler: async (req, res) => {
        finalStepRan = true
        return res.status(200).json({ ok: true })
      }
    }
  ])

  assert.equal(result.ok, false)
  assert.equal(result.completedSteps, 1)
  assert.equal(result.failedStep, "failed")
  assert.equal(result.failureStatusCode, 429)
  assert.equal(result.failure.code, "RATE_LIMITED")
  assert.equal(finalStepRan, false)
})

test("internal route invocation converts thrown errors to a safe response", async () => {
  const response = await invokeRouteHandler(async () => {
    throw new Error("sensitive upstream detail")
  }, { stepName: "unsafeStep" })

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, {
    error: "Internal server error",
    code: "INTERNAL_SERVER_ERROR"
  })
})
