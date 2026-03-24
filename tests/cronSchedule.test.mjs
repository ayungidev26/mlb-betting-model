import test from "node:test"
import assert from "node:assert/strict"

import {
  getEasternDateKey,
  getEasternTimeParts,
  isDailyPipelineWindow
} from "../lib/cronSchedule.js"

test("getEasternTimeParts converts UTC time into Eastern Daylight Time", () => {
  const date = new Date("2026-07-02T01:25:00.000Z")
  const easternTime = getEasternTimeParts(date)

  assert.equal(getEasternDateKey(date), "2026-07-01")
  assert.equal(easternTime.timeZone, "America/New_York")
  assert.equal(easternTime.hour, 21)
  assert.equal(easternTime.minute, 25)
})

test("isDailyPipelineWindow matches the 9:25 PM Eastern execution time during standard time", () => {
  const date = new Date("2026-01-16T02:25:00.000Z")
  const schedulerWindow = isDailyPipelineWindow(date)

  assert.equal(schedulerWindow.dateKey, "2026-01-15")
  assert.equal(schedulerWindow.hour, 21)
  assert.equal(schedulerWindow.minute, 25)
  assert.equal(schedulerWindow.matchesTargetHour, true)
  assert.equal(schedulerWindow.matchesTargetMinute, true)
  assert.equal(schedulerWindow.matchesTargetTime, true)
  assert.equal(schedulerWindow.targetHour, 21)
  assert.equal(schedulerWindow.targetMinute, 25)
})

test("isDailyPipelineWindow rejects non-9:25 PM Eastern times", () => {
  const date = new Date("2026-01-16T01:00:00.000Z")
  const schedulerWindow = isDailyPipelineWindow(date)

  assert.equal(schedulerWindow.hour, 20)
  assert.equal(schedulerWindow.minute, 0)
  assert.equal(schedulerWindow.matchesTargetHour, false)
  assert.equal(schedulerWindow.matchesTargetMinute, false)
  assert.equal(schedulerWindow.matchesTargetTime, false)
})
