const baseUrl = process.env.SCHEDULER_BASE_URL || "http://localhost:3000"
const cronSecret = process.env.CRON_SECRET
const force = process.argv.includes("--no-force") ? "false" : "true"
const statsEndpoint = new URL("/api/cron/runDailyStatsPipeline", baseUrl)
const marketEndpoint = new URL("/api/cron/runDailyPipeline", baseUrl)

if (force === "true") {
  statsEndpoint.searchParams.set("force", "true")
  marketEndpoint.searchParams.set("force", "true")
}

if (!cronSecret) {
  console.error("Missing CRON_SECRET environment variable.")
  process.exit(1)
}

const statsResponse = await fetch(statsEndpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`
  }
})

const statsPayload = await statsResponse.json().catch(() => ({}))

console.log(JSON.stringify({
  step: "runDailyStatsPipeline",
  ok: statsResponse.ok,
  status: statsResponse.status,
  endpoint: statsEndpoint.toString(),
  payload: statsPayload
}, null, 2))

if (!statsResponse.ok) {
  process.exit(1)
}

const marketResponse = await fetch(marketEndpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`
  }
})

const marketPayload = await marketResponse.json().catch(() => ({}))

console.log(JSON.stringify({
  step: "runDailyPipeline",
  ok: marketResponse.ok,
  status: marketResponse.status,
  endpoint: marketEndpoint.toString(),
  payload: marketPayload
}, null, 2))

if (!marketResponse.ok) {
  process.exit(1)
}
