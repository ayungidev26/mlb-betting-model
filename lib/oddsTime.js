const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function normalizeBufferMinutes(bufferMinutes) {
  return Number.isFinite(bufferMinutes) && bufferMinutes >= 0
    ? bufferMinutes
    : 0
}

function parseNowUtcMillis(nowUtc) {
  if (typeof nowUtc === 'number') {
    return Number.isFinite(nowUtc)
      ? nowUtc
      : null
  }

  if (nowUtc instanceof Date) {
    const millis = nowUtc.getTime()

    return Number.isFinite(millis)
      ? millis
      : null
  }

  return parseCommenceTimeMillis(nowUtc)
}

export function parseCommenceTimeMillis(commenceTime) {
  if (typeof commenceTime !== 'string' || !ISO_TIMESTAMP_PATTERN.test(commenceTime)) {
    return null
  }

  const millis = Date.parse(commenceTime)

  return Number.isFinite(millis)
    ? millis
    : null
}

export function isStarted(commenceTime, nowUtc = Date.now(), bufferMinutes = 2) {
  const commenceMillis = parseCommenceTimeMillis(commenceTime)

  if (commenceMillis === null) {
    return null
  }

  const nowMillis = parseNowUtcMillis(nowUtc)

  if (nowMillis === null) {
    return null
  }

  const bufferMillis = normalizeBufferMinutes(bufferMinutes) * 60 * 1000

  return commenceMillis <= (nowMillis - bufferMillis)
}

export function splitOddsByStartStatus(records, nowUtc = Date.now(), bufferMinutes = 2) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      started: [],
      upcoming: [],
      invalid: [],
      invalidCount: 0
    }
  }

  const started = []
  const upcoming = []
  const invalid = []

  for (const record of records) {
    const startedStatus = isStarted(record?.commenceTime, nowUtc, bufferMinutes)

    if (startedStatus === null) {
      invalid.push(record)
      continue
    }

    if (startedStatus) {
      started.push(record)
      continue
    }

    upcoming.push(record)
  }

  return {
    started,
    upcoming,
    invalid,
    invalidCount: invalid.length
  }
}
