import { normalizeMlbTeamName } from "./teamNames.js"

export const STATS_QUALITY_VERSION = "v1"
export const MINIMUM_PITCHER_RECORDS = 200

export function expectedSlate(games = []) {
  const teams = new Set()
  const pitchers = new Set()
  for (const game of games) {
    if (game?.awayTeam) teams.add(normalizeMlbTeamName(game.awayTeam))
    if (game?.homeTeam) teams.add(normalizeMlbTeamName(game.homeTeam))
    if (game?.awayPitcherId) pitchers.add(String(game.awayPitcherId))
    if (game?.homePitcherId) pitchers.add(String(game.homePitcherId))
  }
  return { teams: [...teams].filter(Boolean), pitchers: [...pitchers], games }
}

export function validateStatsCandidate({ kind, candidate, games = [], providerFailures = 0, minimumPitchers = MINIMUM_PITCHER_RECORDS, now = new Date() }) {
  const expected = expectedSlate(games)
  const records = kind === "pitchers" ? (candidate?.byId || {}) : (candidate || {})
  const recordKeys = new Set(Object.keys(records).map(key => kind === "pitchers" ? String(key) : normalizeMlbTeamName(key)))
  const missingTeams = kind === "pitchers" ? [] : expected.teams.filter(team => !recordKeys.has(team))
  const missingPitchers = kind === "pitchers" ? expected.pitchers.filter(id => !recordKeys.has(id)) : []
  const gamesCovered = expected.games.filter(game => kind === "pitchers"
    ? [game.awayPitcherId, game.homePitcherId].filter(Boolean).every(id => recordKeys.has(String(id)))
    : [game.awayTeam, game.homeTeam].every(team => recordKeys.has(normalizeMlbTeamName(team)))).length
  const enoughPitchers = kind !== "pitchers" || recordKeys.size >= minimumPitchers
  const healthy = providerFailures === 0 && missingTeams.length === 0 && missingPitchers.length === 0 && enoughPitchers
  return {
    schemaVersion: STATS_QUALITY_VERSION, dateKey: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now),
    generatedAt: now.toISOString(), expectedTeams: expected.teams.length, teamsCovered: expected.teams.length - missingTeams.length,
    expectedGames: games.length, gamesCovered, missingTeams, missingPitchers, providerFailures,
    records: recordKeys.size, status: healthy ? "healthy" : (recordKeys.size ? "degraded" : "failed"),
    reasons: [...(enoughPitchers ? [] : [`pitcher coverage below ${minimumPitchers}`]), ...(missingTeams.length ? ["scheduled teams missing"] : []), ...(missingPitchers.length ? ["announced starters missing"] : []), ...(providerFailures ? ["provider failures"] : [])]
  }
}

export async function publishStatsCandidate(redisClient, { kind, candidate, metadata }) {
  const baseKey = `mlb:stats:${kind}`
  await redisClient.set(`${baseKey}:candidate`, candidate)
  await redisClient.set(`${baseKey}:refresh:meta`, metadata)
  if (metadata.status !== "healthy") return { published: false, metadata }
  // Upstash pipelines execute the paired current payload/metadata update as one request.
  if (typeof redisClient.pipeline === "function") {
    await redisClient.pipeline().set(baseKey, candidate).set(`${baseKey}:meta`, metadata).exec()
  } else {
    await redisClient.set(baseKey, candidate)
    await redisClient.set(`${baseKey}:meta`, metadata)
  }
  return { published: true, metadata }
}
