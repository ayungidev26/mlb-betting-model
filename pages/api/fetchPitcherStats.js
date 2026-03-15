import { redis } from "../../lib/upstash"

export default async function handler(req, res) {

  try {

    const games = await redis.get("mlb:games:today")

    if (!games || games.length === 0) {
      return res.status(200).json({
        message: "No games found"
      })
    }

    const pitcherStats = {}

    for (const game of games) {

      const pitchers = [
        game.homePitcher,
        game.awayPitcher
      ]

      for (const name of pitchers) {

        if (!name || pitcherStats[name]) continue

        const searchUrl =
          `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`

        const searchRes = await fetch(searchUrl)
        const searchData = await searchRes.json()

        if (!searchData.people || searchData.people.length === 0) continue

        const playerId = searchData.people[0].id

        const statsUrl =
          `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=pitching`

        const statsRes = await fetch(statsUrl)
        const statsData = await statsRes.json()

        const stat =
          statsData.stats?.[0]?.splits?.[0]?.stat

        if (!stat) continue

        pitcherStats[name] = {
          era: parseFloat(stat.era),
          whip: parseFloat(stat.whip),
          strikeouts: parseInt(stat.strikeOuts),
          innings: parseFloat(stat.inningsPitched)
        }

      }

    }

    await redis.set("mlb:stats:pitchers", pitcherStats)

    res.status(200).json({
      pitchersCollected: Object.keys(pitcherStats).length,
      sample: Object.entries(pitcherStats).slice(0,3)
    })

  } catch (error) {

    res.status(500).json({
      error: error.message
    })

  }

}
