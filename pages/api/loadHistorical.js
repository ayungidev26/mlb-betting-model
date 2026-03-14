export default async function handler(req, res) {

  const seasons = [
    2015, 2016, 2017, 2018, 2019,
    2020, 2021, 2022, 2023, 2024,
    2025
  ]

  const allGames = []

  try {

    for (const season of seasons) {

      const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}`

      const response = await fetch(url)
      const data = await response.json()

      if (!data.dates) continue

      const games = data.dates.flatMap(date => date.games)

      games.forEach(game => {

        const homeScore = game?.teams?.home?.score
        const awayScore = game?.teams?.away?.score
        const gameType = game?.gameType

        // Only include completed games
        if (homeScore !== undefined && awayScore !== undefined) {

          let seasonType = null

          // Regular season
          if (gameType === "R") {
            seasonType = "regular"
          }

          // Postseason
          if (["P","F","D","L","W"].includes(gameType)) {
            seasonType = "playoffs"
          }

          // Only store if it's regular season or playoffs
          if (seasonType) {

            allGames.push({
              season: season,
              seasonType: seasonType,
              date: game.gameDate,
              homeTeam: game.teams.home.team.name,
              awayTeam: game.teams.away.team.name,
              homeScore: homeScore,
              awayScore: awayScore
            })

          }

        }

      })

    }

    res.status(200).json({
      seasonsLoaded: seasons.length,
      gamesCollected: allGames.length,
      sample: allGames.slice(0,5)
    })

  } catch (error) {

    res.status(500).json({
      error: "Failed to load historical MLB data",
      message: error.message
    })

  }

}
