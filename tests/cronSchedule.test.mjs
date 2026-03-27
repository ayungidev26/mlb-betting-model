import test from "node:test"
import assert from "node:assert/strict"

import {
  getEasternDateKey,
  getEasternTimeParts,
  isDailyPipelineWindow,
  isDailyStatsPipelineWindow
} from "../lib/cronSchedule.js"

test("getEasternTimeParts converts UTC time into Eastern Daylight Time", () => {
  const date = new Date("2026-07-02T14:00:00.000Z")
  const easternTime = getEasternTimeParts(date)

  assert.equal(getEasternDateKey(date), "2026-07-02")
  assert.equal(easternTime.timeZone, "America/New_York")
  assert.equal(easternTime.hour, 10)
  assert.equal(easternTime.minute, 0)
})

test("isDailyPipelineWindow matches the 10:00 AM Eastern execution time during standard time", () => {
  const date = new Date("2026-01-16T15:00:00.000Z")
  const schedulerWindow = isDailyPipelineWindow(date)

  assert.equal(schedulerWindow.dateKey, "2026-01-16")
  assert.equal(schedulerWindow.hour, 10)
  assert.equal(schedulerWindow.minute, 0)
  assert.equal(schedulerWindow.matchesTargetHour, true)
  assert.equal(schedulerWindow.matchesTargetMinute, true)
  assert.equal(schedulerWindow.matchesTargetTime, true)
  assert.equal(schedulerWindow.targetHour, 10)
  assert.equal(schedulerWindow.targetMinute, 0)
})

test("isDailyPipelineWindow rejects non-10:00 AM Eastern times", () => {
  const date = new Date("2026-01-16T14:30:00.000Z")
  const schedulerWindow = isDailyPipelineWindow(date)

  assert.equal(schedulerWindow.hour, 9)
  assert.equal(schedulerWindow.minute, 30)
  assert.equal(schedulerWindow.matchesTargetHour, false)
  assert.equal(schedulerWindow.matchesTargetMinute, false)
  assert.equal(schedulerWindow.matchesTargetTime, false)
})

test("isDailyStatsPipelineWindow matches times inside the 5:30 AM to 8:30 AM Eastern window", () => {
  const date = new Date("2026-01-16T11:45:00.000Z")
  const schedulerWindow = isDailyStatsPipelineWindow(date)

  assert.equal(schedulerWindow.hour, 6)
  assert.equal(schedulerWindow.minute, 45)
  assert.equal(schedulerWindow.startHour, 5)
  assert.equal(schedulerWindow.startMinute, 30)
  assert.equal(schedulerWindow.endHour, 8)
  assert.equal(schedulerWindow.endMinute, 30)
  assert.equal(schedulerWindow.matchesWindow, true)
})

test("isDailyStatsPipelineWindow rejects times outside the configured morning window", () => {
  const date = new Date("2026-01-16T14:00:00.000Z")
  const schedulerWindow = isDailyStatsPipelineWindow(date)

  assert.equal(schedulerWindow.hour, 9)
  assert.equal(schedulerWindow.minute, 0)
  assert.equal(schedulerWindow.matchesWindow, false)
})
