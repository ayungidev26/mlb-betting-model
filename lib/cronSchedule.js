const EASTERN_TIME_ZONE = "America/New_York"
const DAILY_PIPELINE_HOUR = 10
const DAILY_PIPELINE_MINUTE = 0
const STATS_PIPELINE_WINDOW_START_HOUR = 5
const STATS_PIPELINE_WINDOW_START_MINUTE = 30
const STATS_PIPELINE_WINDOW_DURATION_MINUTES = 180
const WEEKLY_RATINGS_REFRESH_DAY = 1
const WEEKLY_RATINGS_REFRESH_HOUR = 1
const WEEKLY_RATINGS_REFRESH_MINUTE = 7
const MLB_ACTIVE_SEASON_START_MONTH = 3
const MLB_ACTIVE_SEASON_END_MONTH = 10

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

export function isEasternTimeWindow(date = new Date(), window = {}) {
  const {
    startHour = 0,
    startMinute = 0,
    durationMinutes = 0
  } = window
  const easternTime = getEasternTimeParts(date)
  const startMinuteOfDay = (startHour * 60) + startMinute
  const minuteOfDay = (easternTime.hour * 60) + easternTime.minute
  const endMinuteOfDay = startMinuteOfDay + durationMinutes
  const matchesWindow =
    durationMinutes > 0 &&
    minuteOfDay >= startMinuteOfDay &&
    minuteOfDay <= endMinuteOfDay

  return {
    ...easternTime,
    startHour,
    startMinute,
    durationMinutes,
    endHour: Math.floor(endMinuteOfDay / 60),
    endMinute: endMinuteOfDay % 60,
    minuteOfDay,
    startMinuteOfDay,
    endMinuteOfDay,
    matchesWindow
  }
}

export function isDailyStatsPipelineWindow(date = new Date()) {
  return isEasternTimeWindow(date, {
    startHour: STATS_PIPELINE_WINDOW_START_HOUR,
    startMinute: STATS_PIPELINE_WINDOW_START_MINUTE,
    durationMinutes: STATS_PIPELINE_WINDOW_DURATION_MINUTES
  })
}

export function isWeeklyRatingsRefreshWindow(date = new Date()) {
  const easternTime = getEasternTimeParts(date)
  const easternDate = new Date(`${easternTime.dateKey}T12:00:00Z`)
  const month = Number(easternTime.dateKey.slice(5, 7))
  const dayOfWeek = easternDate.getUTCDay()
  const activeSeason =
    month >= MLB_ACTIVE_SEASON_START_MONTH &&
    month <= MLB_ACTIVE_SEASON_END_MONTH

  return {
    ...easternTime,
    dayOfWeek,
    targetDayOfWeek: WEEKLY_RATINGS_REFRESH_DAY,
    targetHour: WEEKLY_RATINGS_REFRESH_HOUR,
    targetMinute: WEEKLY_RATINGS_REFRESH_MINUTE,
    activeSeason,
    matchesTargetTime:
      activeSeason &&
      dayOfWeek === WEEKLY_RATINGS_REFRESH_DAY &&
      easternTime.hour === WEEKLY_RATINGS_REFRESH_HOUR &&
      easternTime.minute === WEEKLY_RATINGS_REFRESH_MINUTE
  }
}
