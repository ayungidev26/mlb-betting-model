import { getPitcherRatingDetails } from "./pitcherRatings.js"
import { getBullpenRatingDetails } from "./bullpenRatings.js"
import { getOffenseRatingDetails } from "./offenseRatings.js"
import {
  DEFAULT_BALLPARK_FACTOR,
  getBallparkHandednessFactor,
  resolveBallparkFactors
} from "../lib/ballparkFactors.js"

function resolveOpposingPitcherHand(pitcherDetails) {
  const throwingHand = pitcherDetails?.stats?.throwingHand || null
  return typeof throwingHand === "string" && throwingHand.length > 0 ? throwingHand : null
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function toNumber(value, fallback = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function calculatePitcherHomeRunExposure(stats = null) {
  const explicitRate = toNumber(stats?.hrPerFlyBallRate)

  if (explicitRate !== null) {
    return explicitRate
  }

  const homeRunsAllowed = toNumber(stats?.homeRunsAllowed)
  const flyBalls = toNumber(stats?.flyBalls)

  if (homeRunsAllowed === null || flyBalls === null || flyBalls <= 0) {
    return 0.105
  }

  return homeRunsAllowed / flyBalls
}

function buildBallparkAdjustmentDetails({
  team,
  offenseDetails,
  opposingPitcherDetails,
  opposingPitcherHand,
  ballpark
}) {
  const baselineRunsPerGame = toNumber(offenseDetails?.stats?.overall?.runsPerGame, 4.2)
  const baselineWeightedRunsCreatedPlus = toNumber(offenseDetails?.stats?.overall?.weightedRunsCreatedPlus, 100)
  const baselineBarrelRate = toNumber(offenseDetails?.stats?.overall?.barrelRate, 0.07)
  const handednessFactor = getBallparkHandednessFactor(ballpark, opposingPitcherHand)
  const runFactor = toNumber(ballpark?.runFactor, DEFAULT_BALLPARK_FACTOR)
  const hitsFactor = toNumber(ballpark?.hitsFactor, DEFAULT_BALLPARK_FACTOR)
  const doublesTriplesFactor = toNumber(ballpark?.doublesTriplesFactor, DEFAULT_BALLPARK_FACTOR)
  const homeRunFactor = toNumber(ballpark?.homeRunFactor, DEFAULT_BALLPARK_FACTOR)
  const pitcherHomeRunExposure = calculatePitcherHomeRunExposure(opposingPitcherDetails?.stats)
  const powerSynergy = clamp(
    ((baselineBarrelRate - 0.07) * 3.5) + ((pitcherHomeRunExposure - 0.105) * 4.5),
    -0.25,
    0.45
  )
  const expectedRuns = Number((
    baselineRunsPerGame *
    runFactor *
    (0.985 + ((hitsFactor - DEFAULT_BALLPARK_FACTOR) * 0.45)) *
    (0.99 + ((doublesTriplesFactor - DEFAULT_BALLPARK_FACTOR) * 0.3)) *
    (0.99 + ((handednessFactor - DEFAULT_BALLPARK_FACTOR) * 0.55))
  ).toFixed(3))

  // Park effects are applied as offense-side deltas so the same venue can change each team differently depending on
  // its quality of contact and the opposing starter's home-run susceptibility.
  const runEnvironmentAdjustment = (runFactor - DEFAULT_BALLPARK_FACTOR) * 42
  const hitEnvironmentAdjustment = (hitsFactor - DEFAULT_BALLPARK_FACTOR) * 18
  const gapEnvironmentAdjustment = (doublesTriplesFactor - DEFAULT_BALLPARK_FACTOR) * 14
  const handednessAdjustment = (handednessFactor - DEFAULT_BALLPARK_FACTOR) * 22
  const homeRunEnvironmentAdjustment = (homeRunFactor - DEFAULT_BALLPARK_FACTOR) * (24 + (baselineWeightedRunsCreatedPlus - 100) * 0.16)
  const powerPitcherSynergyAdjustment = homeRunEnvironmentAdjustment * powerSynergy
  const ratingAdjustment = Number((
    runEnvironmentAdjustment +
    hitEnvironmentAdjustment +
    gapEnvironmentAdjustment +
    handednessAdjustment +
    powerPitcherSynergyAdjustment
  ).toFixed(2))

  return {
    team,
    venue: ballpark?.venue || null,
    classification: ballpark?.classification || "neutral",
    factors: {
      runFactor,
      homeRunFactor,
      hitsFactor,
      doublesTriplesFactor,
      handednessFactor
    },
    adjustments: {
      runEnvironmentAdjustment: Number(runEnvironmentAdjustment.toFixed(2)),
      hitEnvironmentAdjustment: Number(hitEnvironmentAdjustment.toFixed(2)),
      gapEnvironmentAdjustment: Number(gapEnvironmentAdjustment.toFixed(2)),
      handednessAdjustment: Number(handednessAdjustment.toFixed(2)),
      homeRunEnvironmentAdjustment: Number(homeRunEnvironmentAdjustment.toFixed(2)),
      powerPitcherSynergyAdjustment: Number(powerPitcherSynergyAdjustment.toFixed(2))
    },
    expectedRuns,
    baselineRunsPerGame,
    baselineBarrelRate,
    pitcherHomeRunExposure: Number(pitcherHomeRunExposure.toFixed(4)),
    ratingAdjustment
  }
}

export async function predictGame(game, teamRatings, bullpenStats, pitcherStats = null, offenseStats = null) {
  try {
    const homeTeam = game.homeTeam
    const awayTeam = game.awayTeam

    const homeTeamRating = teamRatings?.[homeTeam] || 1500
    const awayTeamRating = teamRatings?.[awayTeam] || 1500

    const homePitcherDetails =
      await getPitcherRatingDetails({
        name: game.homePitcher,
        pitcherId: game.homePitcherId,
        team: homeTeam
      }, pitcherStats)
    const awayPitcherDetails =
      await getPitcherRatingDetails({
        name: game.awayPitcher,
        pitcherId: game.awayPitcherId,
        team: awayTeam
      }, pitcherStats)

    const homePitcherRating = homePitcherDetails.rating
    const awayPitcherRating = awayPitcherDetails.rating

    const homeBullpenDetails =
      getBullpenRatingDetails(homeTeam, bullpenStats)

    const awayBullpenDetails =
      getBullpenRatingDetails(awayTeam, bullpenStats)

    const homeBullpenRating = homeBullpenDetails.rating
    const awayBullpenRating = awayBullpenDetails.rating

    const homeOffenseDetails = getOffenseRatingDetails(homeTeam, offenseStats, {
      isHomeTeam: true,
      opposingPitcherHand: resolveOpposingPitcherHand(awayPitcherDetails)
    })
    const awayOffenseDetails = getOffenseRatingDetails(awayTeam, offenseStats, {
      isHomeTeam: false,
      opposingPitcherHand: resolveOpposingPitcherHand(homePitcherDetails)
    })

    const homeOffenseRating = homeOffenseDetails.rating
    const awayOffenseRating = awayOffenseDetails.rating
    const ballpark = game?.ballpark || await resolveBallparkFactors({
      venue: game?.venue || null,
      homeTeam
    })
    const homeBallparkAdjustment = buildBallparkAdjustmentDetails({
      team: homeTeam,
      offenseDetails: homeOffenseDetails,
      opposingPitcherDetails: awayPitcherDetails,
      opposingPitcherHand: resolveOpposingPitcherHand(awayPitcherDetails),
      ballpark
    })
    const awayBallparkAdjustment = buildBallparkAdjustmentDetails({
      team: awayTeam,
      offenseDetails: awayOffenseDetails,
      opposingPitcherDetails: homePitcherDetails,
      opposingPitcherHand: resolveOpposingPitcherHand(homePitcherDetails),
      ballpark
    })

    const HOME_FIELD = 25

    const homeRating =
      homeTeamRating +
      homePitcherRating +
      homeBullpenRating +
      homeOffenseRating +
      homeBallparkAdjustment.ratingAdjustment +
      HOME_FIELD

    const awayRating =
      awayTeamRating +
      awayPitcherRating +
      awayBullpenRating +
      awayOffenseRating +
      awayBallparkAdjustment.ratingAdjustment

    const ratingDiff = homeRating - awayRating

    const homeWinProbability =
      1 / (1 + Math.pow(10, (-ratingDiff / 400)))

    const awayWinProbability =
      1 - homeWinProbability

    return {
      gameId: game.gameId,
      matchKey: game.matchKey || null,
      date: game.date || null,

      homeTeam,
      awayTeam,

      homePitcher: game.homePitcher || null,
      homePitcherId: homePitcherDetails.pitcherId || game.homePitcherId || null,
      awayPitcher: game.awayPitcher || null,
      awayPitcherId: awayPitcherDetails.pitcherId || game.awayPitcherId || null,
      venue: game.venue || ballpark.venue || null,
      ballpark,

      homeRating,
      awayRating,

      pitcherModel: {
        home: {
          name: game.homePitcher || null,
          pitcherId: homePitcherDetails.pitcherId || game.homePitcherId || null,
          rating: homePitcherRating,
          stats: homePitcherDetails.stats,
          components: homePitcherDetails.components
        },
        away: {
          name: game.awayPitcher || null,
          pitcherId: awayPitcherDetails.pitcherId || game.awayPitcherId || null,
          rating: awayPitcherRating,
          stats: awayPitcherDetails.stats,
          components: awayPitcherDetails.components
        }
      },

      bullpenModel: {
        home: {
          rating: homeBullpenRating,
          stats: homeBullpenDetails.stats,
          components: homeBullpenDetails.components
        },
        away: {
          rating: awayBullpenRating,
          stats: awayBullpenDetails.stats,
          components: awayBullpenDetails.components
        }
      },

      offenseModel: {
        home: {
          rating: homeOffenseRating,
          stats: homeOffenseDetails.stats,
          components: homeOffenseDetails.components,
          derived: homeOffenseDetails.derived
        },
        away: {
          rating: awayOffenseRating,
          stats: awayOffenseDetails.stats,
          components: awayOffenseDetails.components,
          derived: awayOffenseDetails.derived
        }
      },

      ballparkModel: {
        source: ballpark.source || null,
        classification: ballpark.classification || "neutral",
        home: homeBallparkAdjustment,
        away: awayBallparkAdjustment
      },

      homeWinProbability: Number(homeWinProbability.toFixed(4)),
      awayWinProbability: Number(awayWinProbability.toFixed(4))
    }
  } catch (error) {
    console.error("Prediction error:", error)

    return null
  }
}
