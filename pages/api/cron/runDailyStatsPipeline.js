import runStatsPipelineHandler from "../runStatsPipeline.js"
import {
  getOperationalRouteSecret,
  requireCronRouteAccess
} from "../../../lib/apiSecurity.js"
import { isDailyStatsPipelineWindow } from "../../../lib/cronSchedule.js"

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

function shouldForceRun(query = {}) {
  return query.force === "true"
}

function getWindowLabel(window) {
  const startHourLabel = String(window.startHour).padStart(2, "0")
  const startMinuteLabel = String(window.startMinute).padStart(2, "0")
  const endHourLabel = String(window.endHour).padStart(2, "0")
  const endMinuteLabel = String(window.endMinute).padStart(2, "0")

  return `${startHourLabel}:${startMinuteLabel}-${endHourLabel}:${endMinuteLabel} America/New_York`
}

export default async function handler(req, res) {
  if (!requireCronRouteAccess(req, res)) {
    return
  }

  const force = shouldForceRun(req.query)
  const schedulerWindow = isDailyStatsPipelineWindow()

  if (!force && !schedulerWindow.matchesWindow) {
    return res.status(202).json({
      ok: true,
      skipped: true,
      reason: `Outside the ${getWindowLabel(schedulerWindow)} execution window`,
      schedulerWindow,
      currentUtcTime: new Date().toISOString()
    })
  }

  const operationalSecret = getOperationalRouteSecret()

  if (!operationalSecret) {
    return res.status(503).json({
      error: "Operational route secret is not configured"
    })
  }

  const internalResponse = createMockResponse()

  try {
    await runStatsPipelineHandler(
      {
        method: "POST",
        query: force ? { force: "true" } : {},
        headers: {
          authorization: `Bearer ${operationalSecret}`,
          "x-forwarded-for": "127.0.0.1",
          "x-scheduler-source": force ? "manual" : "vercel-cron"
        },
        socket: {
          remoteAddress: "127.0.0.1"
        }
      },
      internalResponse
    )

    return res.status(internalResponse.statusCode).json({
      ok: internalResponse.statusCode < 400,
      trigger: force ? "manual" : "cron",
      schedulerWindow,
      pipeline: internalResponse.body
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      schedulerWindow
    })
  }
}
