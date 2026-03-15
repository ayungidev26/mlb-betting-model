import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const seasons = [
      2015,2016,2017,2018,2019,
      2020,2021,2022,2023,2024,2025
    ]

    let totalGames = 0

    for (const season of seasons) {

      const url =
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}`

      const response = await fetch(url)
      const data = await response.json()

      const seasonGames = []

      if (!data.dates) continue

      for (const date of data.dates) {

        for (const game of date.games) {

          // Ignore games not completed
          if (game.status.detailedState !== "Final") continue

          let seasonType = "regular"

          if (["P","F","D","L","W"].includes(game.gameType)) {
            seasonType = "playoffs"
          }

          seasonGames.push({
            season: season,
            date: game.gameDate,
            homeTeam: game.teams.home.team.name,
            awayTeam: game.teams.away.team.name,
            homeScore: game.teams.home.score,
            awayScore: game.teams.away.score,
            seasonType: seasonType
          })

        }

      }

      // Save season to Redis
      await redis.set(
        `mlb:games:historical:${season}`,
        seasonGames
      )

      totalGames += seasonGames.length

    }

    res.status(200).json({
      seasonsLoaded: seasons.length,
      gamesCollected: totalGames,
      redisKeysCreated: seasons.map(
        s => `mlb:games:historical:${s}`
      )
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
