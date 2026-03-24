const EASTERN_TIME_ZONE = "America/New_York"
const DAILY_PIPELINE_HOUR = 21
const DAILY_PIPELINE_MINUTE = 25

const easternDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
})

const easternTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
})

function getFormatterPartValue(parts, type) {
  return parts.find((part) => part.type === type)?.value || null
}

export function getEasternDateKey(date = new Date()) {
  return easternDateFormatter.format(date)
}

export function getEasternTimeParts(date = new Date()) {
  const parts = easternTimeFormatter.formatToParts(date)

  return {
    timeZone: EASTERN_TIME_ZONE,
    dateKey: getEasternDateKey(date),
    hour: Number(getFormatterPartValue(parts, "hour") || 0),
    minute: Number(getFormatterPartValue(parts, "minute") || 0),
    second: Number(getFormatterPartValue(parts, "second") || 0)
  }
}

export function isDailyPipelineWindow(date = new Date()) {
  const easternTime = getEasternTimeParts(date)
  const matchesTargetHour = easternTime.hour === DAILY_PIPELINE_HOUR
  const matchesTargetMinute = easternTime.minute === DAILY_PIPELINE_MINUTE

  return {
    ...easternTime,
    targetHour: DAILY_PIPELINE_HOUR,
    targetMinute: DAILY_PIPELINE_MINUTE,
    matchesTargetHour,
    matchesTargetMinute,
    matchesTargetTime: matchesTargetHour && matchesTargetMinute
  }
}
