function describeValue(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new ValidationError(message)
  }
}

function assertObject(value, label) {
  assertCondition(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
}

function assertString(value, label) {
  assertCondition(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`)
}

function assertNumber(value, label) {
  assertCondition(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`)
}

function assertArray(value, label) {
  assertCondition(Array.isArray(value), `${label} must be an array`)
}

function assertOptionalString(value, label) {
  if (value === undefined || value === null) {
    return
  }

  assertString(value, label)
}

function assertOptionalNumber(value, label) {
  if (value === undefined || value === null) {
    return
  }

  assertNumber(value, label)
}

function validateBallpark(ballpark, label) {
  assertObject(ballpark, label)
  assertOptionalString(ballpark.venue, `${label}.venue`)
  assertOptionalString(ballpark.classification, `${label}.classification`)
  assertOptionalNumber(ballpark.runFactor, `${label}.runFactor`)
  assertOptionalNumber(ballpark.homeRunFactor, `${label}.homeRunFactor`)
  assertOptionalNumber(ballpark.hitsFactor, `${label}.hitsFactor`)
  assertOptionalNumber(ballpark.doublesTriplesFactor, `${label}.doublesTriplesFactor`)
  assertOptionalNumber(ballpark.leftHandedHitterFactor, `${label}.leftHandedHitterFactor`)
  assertOptionalNumber(ballpark.rightHandedHitterFactor, `${label}.rightHandedHitterFactor`)
}

export function validateExternalMlbSchedulePayload(payload) {
  assertObject(payload, 'MLB schedule payload')
  assertArray(payload.dates, 'MLB schedule payload.dates')

  payload.dates.forEach((dateEntry, dateIndex) => {
    assertObject(dateEntry, `MLB schedule payload.dates[${dateIndex}]`)
    assertArray(dateEntry.games, `MLB schedule payload.dates[${dateIndex}].games`)

    dateEntry.games.forEach((game, gameIndex) => {
      const label = `MLB schedule payload.dates[${dateIndex}].games[${gameIndex}]`
      assertObject(game, label)
      assertCondition(game.gamePk !== undefined && game.gamePk !== null, `${label}.gamePk is required`)
      assertString(game.gameDate, `${label}.gameDate`)
      assertString(game.gameType, `${label}.gameType`)
      assertString(game?.teams?.home?.team?.name, `${label}.teams.home.team.name`)
      assertString(game?.teams?.away?.team?.name, `${label}.teams.away.team.name`)
      assertString(game?.status?.detailedState, `${label}.status.detailedState`)
    })
  })
}

export function validateExternalOddsPayload(payload) {
  assertArray(payload, 'Odds API payload')

  payload.forEach((game, gameIndex) => {
    const label = `Odds API payload[${gameIndex}]`
    assertObject(game, label)
    assertCondition(game.id !== undefined && game.id !== null, `${label}.id is required`)
    assertString(game.commence_time, `${label}.commence_time`)
    assertString(game.home_team, `${label}.home_team`)
    assertString(game.away_team, `${label}.away_team`)
    assertArray(game.bookmakers, `${label}.bookmakers`)
  })
}

export function validateCanonicalGame(game, label = 'Game') {
  assertObject(game, label)
  assertCondition(game.gameId !== undefined && game.gameId !== null, `${label}.gameId is required`)
  assertString(game.matchKey, `${label}.matchKey`)
  assertString(game.date, `${label}.date`)
  assertString(game.homeTeam, `${label}.homeTeam`)
  assertString(game.awayTeam, `${label}.awayTeam`)
  assertString(game.seasonType, `${label}.seasonType`)

  if (game.ballpark !== undefined && game.ballpark !== null) {
    validateBallpark(game.ballpark, `${label}.ballpark`)
  }
}

export function validateCanonicalPrediction(prediction, label = 'Prediction') {
  assertObject(prediction, label)
  assertCondition(prediction.gameId !== undefined && prediction.gameId !== null, `${label}.gameId is required`)
  assertString(prediction.matchKey, `${label}.matchKey`)
  assertString(prediction.homeTeam, `${label}.homeTeam`)
  assertString(prediction.awayTeam, `${label}.awayTeam`)
  assertNumber(prediction.homeWinProbability, `${label}.homeWinProbability`)
  assertNumber(prediction.awayWinProbability, `${label}.awayWinProbability`)

  if (prediction.ballpark !== undefined && prediction.ballpark !== null) {
    validateBallpark(prediction.ballpark, `${label}.ballpark`)
  }
}

export function validateCanonicalOddsRecord(record, label = 'OddsRecord') {
  assertObject(record, label)
  assertCondition(record.gameId !== undefined && record.gameId !== null, `${label}.gameId is required`)
  assertString(record.matchKey, `${label}.matchKey`)
  assertString(record.commenceTime, `${label}.commenceTime`)
  assertString(record.homeTeam, `${label}.homeTeam`)
  assertString(record.awayTeam, `${label}.awayTeam`)
  assertNumber(record.homeMoneyline, `${label}.homeMoneyline`)
  assertNumber(record.awayMoneyline, `${label}.awayMoneyline`)
  assertString(record.sportsbook, `${label}.sportsbook`)
  assertString(record.lastUpdated, `${label}.lastUpdated`)

  if (record.sportsbooks !== undefined && record.sportsbooks !== null) {
    assertArray(record.sportsbooks, `${label}.sportsbooks`)

    record.sportsbooks.forEach((line, index) => {
      const lineLabel = `${label}.sportsbooks[${index}]`
      assertObject(line, lineLabel)
      assertString(line.sportsbook, `${lineLabel}.sportsbook`)
      assertOptionalString(line.sportsbookName, `${lineLabel}.sportsbookName`)
      assertString(line.market, `${lineLabel}.market`)
      assertString(line.lastUpdated, `${lineLabel}.lastUpdated`)
      assertArray(line.selections, `${lineLabel}.selections`)

      line.selections.forEach((selection, selectionIndex) => {
        const selectionLabel = `${lineLabel}.selections[${selectionIndex}]`
        assertObject(selection, selectionLabel)
        assertString(selection.name, `${selectionLabel}.name`)
        assertNumber(selection.price, `${selectionLabel}.price`)
      })
    })
  }
}

export function validateRecordArray(records, validator, label) {
  assertArray(records, label)

  records.forEach((record, index) => {
    validator(record, `${label}[${index}]`)
  })
}

export function assertObjectShape(value, label) {
  assertObject(value, label)
}

export function describeInvalidType(value) {
  return describeValue(value)
}
