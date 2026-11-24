import { loadDashboardSlate } from "../../lib/dashboardSlate.js"
import { redis } from "../../lib/upstash.js"

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store")
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "Method not allowed." })
  }

  return res.status(200).json(await loadDashboardSlate(redis))
}
