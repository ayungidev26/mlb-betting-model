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

        // Only include completed games
        if (homeScore !== undefined && awayScore !== undefined) {

          allGames.push({
            season: season,
            date: game.gameDate,
            homeTeam: game.teams.home.team.name,
            awayTeam: game.teams.away.team.name,
            homeScore: homeScore,
            awayScore: awayScore
          })

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
