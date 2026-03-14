import { runPrediction } from "../model/predictor"

export default async function handler(req, res) {

const gamesResponse = await fetch(`${process.env.VERCEL_URL}/api/fetchGames`)
const games = await gamesResponse.json()

const results = []

for (const date of games.dates) {

for (const game of date.games) {

const prediction = runPrediction(game)

results.push({
gamePk: game.gamePk,
prediction
})

}

}

res.status(200).json(results)

}
