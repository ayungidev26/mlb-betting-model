import runPipelineHandler from "../runPipeline.js"
import { redis } from "../../../lib/upstash.js"
import {
  getOperationalRouteSecret,
  requireCronRouteAccess
} from "../../../lib/apiSecurity.js"
import { isDailyPipelineWindow } from "../../../lib/cronSchedule.js"

const DAILY_PIPELINE_MARKER_PREFIX = "mlb:cron:dailyPipeline"
const DAILY_PIPELINE_MARKER_TTL_SECONDS = 7 * 24 * 60 * 60

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

function buildMarkerKey(dateKey) {
  return `${DAILY_PIPELINE_MARKER_PREFIX}:${dateKey}`
}

export default async function handler(req, res) {
  if (!requireCronRouteAccess(req, res)) {
    return
  }

  const force = shouldForceRun(req.query)
  const schedulerWindow = isDailyPipelineWindow()

  if (!force && !schedulerWindow.matchesTargetTime) {
    return res.status(202).json({
      ok: true,
      skipped: true,
      reason: "Outside the 10:00 America/New_York execution window",
      schedulerWindow,
      currentUtcTime: new Date().toISOString()
    })
  }

  const markerKey = buildMarkerKey(schedulerWindow.dateKey)

  if (!force) {
    const claimed = await redis.set(
      markerKey,
      {
        triggeredAt: new Date().toISOString(),
        triggerType: "cron"
      },
      {
        nx: true,
        ex: DAILY_PIPELINE_MARKER_TTL_SECONDS
      }
    )

    if (!claimed) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Daily pipeline already triggered for the current Eastern date",
        markerKey,
        schedulerWindow
      })
    }
  }

  const operationalSecret = getOperationalRouteSecret()

  if (!operationalSecret) {
    if (!force) {
      await redis.del(markerKey)
    }

    return res.status(503).json({
      error: "Operational route secret is not configured"
    })
  }

  const internalResponse = createMockResponse()

  try {
    await runPipelineHandler(
      {
        method: "POST",
        query: {},
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

    if (internalResponse.statusCode >= 400 && !force) {
      await redis.del(markerKey)
    }

    return res.status(internalResponse.statusCode).json({
      ok: internalResponse.statusCode < 400,
      trigger: force ? "manual" : "cron",
      markerKey,
      schedulerWindow,
      pipeline: internalResponse.body
    })
  } catch (error) {
    if (!force) {
      await redis.del(markerKey)
    }

    return res.status(500).json({
      ok: false,
      error: error.message,
      markerKey,
      schedulerWindow
    })
  }
}
