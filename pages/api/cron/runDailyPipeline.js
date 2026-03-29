import runPipelineHandler from "../runPipeline.js"
import runStatsPipelineHandler from "../runStatsPipeline.js"
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

async function invokeInternalHandler(handler, { force, operationalSecret, triggerSource }) {
  const internalResponse = createMockResponse()

  await handler(
    {
      method: "POST",
      query: force ? { force: "true" } : {},
      headers: {
        authorization: `Bearer ${operationalSecret}`,
        "x-forwarded-for": "127.0.0.1",
        "x-scheduler-source": triggerSource
      },
      socket: {
        remoteAddress: "127.0.0.1"
      }
    },
    internalResponse
  )

  return internalResponse
}

export default async function handler(req, res) {
  if (!requireCronRouteAccess(req, res)) {
    return
  }

  const force = shouldForceRun(req.query)
  const schedulerWindow = isDailyPipelineWindow()

  if (!force && !schedulerWindow.matchesTargetTime) {
    const targetHourLabel = String(schedulerWindow.targetHour).padStart(2, "0")
    const targetMinuteLabel = String(schedulerWindow.targetMinute).padStart(2, "0")

    return res.status(202).json({
      ok: true,
      skipped: true,
      reason: `Outside the ${targetHourLabel}:${targetMinuteLabel} America/New_York execution window`,
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

  const triggerSource = force ? "manual" : "vercel-cron"

  try {
    console.info("[runDailyPipeline] running stats pipeline before market pipeline", {
      markerKey,
      trigger: force ? "manual" : "cron",
      schedulerWindow
    })

    const statsPipelineResponse = await invokeInternalHandler(runStatsPipelineHandler, {
      force,
      operationalSecret,
      triggerSource
    })

    if (statsPipelineResponse.statusCode >= 400) {
      if (!force) {
        await redis.del(markerKey)
      }

      console.warn("[runDailyPipeline] stopping because stats pipeline failed", {
        markerKey,
        statusCode: statsPipelineResponse.statusCode,
        trigger: force ? "manual" : "cron"
      })

      return res.status(statsPipelineResponse.statusCode).json({
        ok: false,
        trigger: force ? "manual" : "cron",
        markerKey,
        schedulerWindow,
        stoppedAfter: "statsPipeline",
        reason: "Stats pipeline must succeed before the market pipeline can run.",
        statsPipeline: statsPipelineResponse.body
      })
    }

    const marketPipelineResponse = await invokeInternalHandler(runPipelineHandler, {
      force: false,
      operationalSecret,
      triggerSource
    })

    if (marketPipelineResponse.statusCode === 409) {
      console.warn("[runDailyPipeline] market pipeline blocked because stats prerequisites are missing", {
        markerKey,
        trigger: force ? "manual" : "cron",
        marketPipelineCode: marketPipelineResponse.body?.code || null
      })
    }

    if (marketPipelineResponse.statusCode >= 400 && !force) {
      await redis.del(markerKey)
    }

    return res.status(marketPipelineResponse.statusCode).json({
      ok: marketPipelineResponse.statusCode < 400,
      trigger: force ? "manual" : "cron",
      markerKey,
      schedulerWindow,
      orchestration: {
        order: [
          "runStatsPipeline",
          "runPipeline"
        ],
        stoppedAfter: marketPipelineResponse.statusCode >= 400
          ? "runPipeline"
          : null
      },
      statsPipeline: statsPipelineResponse.body,
      marketPipeline: marketPipelineResponse.body,
      pipeline: marketPipelineResponse.body
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
