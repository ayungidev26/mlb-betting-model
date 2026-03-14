export default async function handler(req, res) {

const today = new Date().toISOString().split("T")[0]

const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}`

const response = await fetch(url)
const data = await response.json()

res.status(200).json(data)

}
