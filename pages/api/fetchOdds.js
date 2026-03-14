export default async function handler(req, res) {

const response = await fetch(
`https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${process.env.ODDS_API_KEY}`
)

const odds = await response.json()

res.status(200).json(odds)

}
