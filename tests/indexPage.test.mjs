import test from "node:test"
import assert from "node:assert/strict"

import { loadCachedPredictionsFromApi } from "../lib/homePageProps.js"

test("homepage data loader reads cached predictions from the public predictions endpoint", async () => {
  const requestedUrls = []

  const predictions = await loadCachedPredictionsFromApi(
    {
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "https"
      }
    },
    async (url) => {
      requestedUrls.push(String(url))

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            predictions: [
              {
                gameId: "game-1",
                matchKey: "2025-04-10|Los Angeles Dodgers|Oakland Athletics",
                date: "2025-04-10T23:10:00Z",
                homeTeam: "Oakland Athletics",
                awayTeam: "Los Angeles Dodgers",
                homeWinProbability: 0.41,
                awayWinProbability: 0.59
              }
            ]
          }
        }
      }
    }
  )

  assert.deepEqual(requestedUrls, ["https://localhost:3000/api/predictions"])
  assert.equal(requestedUrls.some((url) => url.includes("/api/runModel")), false)
  assert.equal(predictions.length, 1)
})
