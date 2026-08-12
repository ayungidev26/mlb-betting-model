import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const workflowUrl = new URL("../.github/workflows/schedule-pipeline.yml", import.meta.url)

test("market workflow requires the stats dependency payload to report success", async () => {
  const workflow = await readFile(workflowUrl, "utf8")

  assert.match(
    workflow,
    /if \(payload\.ok !== true\) process\.exit\(1\);/,
    "a 2xx stats response must not be accepted when the pipeline reports a failed step"
  )
  assert.match(
    workflow,
    /Stats pipeline returned HTTP \$\{stats_status\}, but its response did not report a successful run/,
    "payload failures should be identified clearly in the workflow log"
  )
})

test("market workflow retries transient internal server errors", async () => {
  const workflow = await readFile(workflowUrl, "utf8")

  assert.match(
    workflow,
    /\[\[ "\$status_code" =~ \^5\[0-9\]\[0-9\]\$ \]\]/,
    "only 5xx responses should be treated as transient server failures"
  )
  assert.match(
    workflow,
    /"code"\[\[:space:\]\]\*:\[\[:space:\]\]\*"INTERNAL_SERVER_ERROR"/,
    "internal server error detection should accept compact and formatted JSON"
  )
  assert.match(workflow, /retry_after_seconds="\$\(\( attempt \* 30 \)\)"/)
  assert.match(workflow, /continue\n\s+fi\n\n\s+echo "Market pipeline still returned an internal server error/)
})

test("market workflow error-code checks accept formatted JSON", async () => {
  const workflow = await readFile(workflowUrl, "utf8")

  for (const code of [
    "INCOMPLETE_PREDICTION_BATCH",
    "STATS_PIPELINE_REQUIRED",
    "ODDS_CACHE_INVALID",
    "RATINGS_REFRESH_REQUIRED",
    "COOLDOWN_ACTIVE"
  ]) {
    assert.match(
      workflow,
      new RegExp(`"code"\\[\\[:space:\\]\\]\\*:\\[\\[:space:\\]\\]\\*"[^"\\n]*${code}`),
      `${code} detection should not depend on minified JSON`
    )
  }
})

test("market workflow keeps the final execution gate open through 8:49 PM ET", async () => {
  const workflow = await readFile(workflowUrl, "utf8")

  assert.match(workflow, /label: "5:19 PM → 8:49 PM ET"/)
  assert.match(
    workflow,
    /start: 17 \* 60 \+ 19,\n\s+end: 20 \* 60 \+ 49/,
    "the final market window should include 5:19 PM through 8:49 PM Eastern"
  )
})
