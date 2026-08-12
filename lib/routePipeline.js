import { logServerError } from "./apiErrors.js"

export function createInternalResponse() {
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

export async function invokeRouteHandler(handler, options = {}) {
  const response = createInternalResponse()

  try {
    await handler(
      {
        method: options.method || "POST",
        query: options.query || {},
        headers: options.headers || {},
        ...(options.socket ? { socket: options.socket } : {})
      },
      response
    )
  } catch (error) {
    logServerError(`${options.logContext || "routePipeline"}.invokeRouteHandler`, error, {
      step: options.stepName || handler.name || "anonymous"
    })

    response.statusCode = 500
    response.body = {
      error: "Internal server error",
      code: "INTERNAL_SERVER_ERROR"
    }
  }

  return response
}

export async function runRoutePipeline(steps, request = {}, options = {}) {
  const results = []

  for (const step of steps) {
    const response = await invokeRouteHandler(step.handler, {
      method: request.method,
      headers: request.headers,
      query: step.query,
      logContext: options.logContext,
      stepName: step.name
    })
    const result = {
      step: step.name,
      status: response.statusCode < 400 ? "success" : "failed",
      statusCode: response.statusCode,
      result: response.body
    }

    results.push(result)

    if (result.status === "failed") {
      return {
        ok: false,
        completedSteps: results.length - 1,
        failedStep: step.name,
        failure: response.body,
        failureStatusCode: response.statusCode,
        steps: results
      }
    }
  }

  return {
    ok: true,
    completedSteps: results.length,
    failedStep: null,
    failure: null,
    failureStatusCode: null,
    steps: results
  }
}
