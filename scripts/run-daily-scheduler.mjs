const baseUrl = process.env.SCHEDULER_BASE_URL || "http://localhost:3000"
const cronSecret = process.env.CRON_SECRET
const force = process.argv.includes("--no-force") ? "false" : "true"
const endpoint = new URL("/api/cron/runDailyPipeline", baseUrl)

if (force === "true") {
  endpoint.searchParams.set("force", "true")
}

if (!cronSecret) {
  console.error("Missing CRON_SECRET environment variable.")
  process.exit(1)
}

const response = await fetch(endpoint, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${cronSecret}`
  }
})

const payload = await response.json().catch(() => ({}))

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  endpoint: endpoint.toString(),
  payload
}, null, 2))

if (!response.ok) {
  process.exit(1)
}
