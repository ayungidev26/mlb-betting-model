# MLB Betting Model

## Overview

This application is a serverless MLB betting model that collects game data, builds predictive ratings, compares model probabilities to sportsbook odds, and identifies betting edges.

The system runs entirely in the cloud using a modern serverless architecture powered by **Next.js APIs**, **Vercel**, and **Upstash Redis**.

The model evaluates each MLB game using a combination of:

* Historical team strength (Elo rating system)
* Starting pitcher performance
* Bullpen strength
* Home field advantage
* Sportsbook betting odds

By comparing model win probabilities to sportsbook implied probabilities, the system automatically identifies games where the model believes the sportsbook odds are mispriced.

---

## Architecture

Cloud stack:

* Frontend/API hosting: Vercel
* Serverless API layer: Next.js
* Database: Upstash Redis
* Data source: MLB Stats API
* Odds source: Odds API

---

## Model Pipeline

The application runs a data pipeline that builds predictions and detects betting edges.

### 1. Fetch Today's MLB Games

`/api/fetchGames`

Pulls the current MLB schedule from the MLB Stats API and stores the games in Redis.

Stored in Redis:

```
mlb:games:today
```

Data includes:

* Teams
* Game date
* Probable starting pitchers
* Venue
* Season type (spring / regular / playoffs)

---

### 2. Fetch Sportsbook Odds

`/api/fetchOdds`

Pulls sportsbook moneyline odds and stores them for comparison with model predictions.

Stored in Redis:

```
mlb:odds:today
```

---

### 3. Collect Pitcher Statistics

`/api/fetchPitcherStats`

Retrieves season statistics for the probable starting pitchers.

Metrics collected:

* ERA
* WHIP
* Strikeouts
* Innings pitched

Stored in Redis:

```
mlb:stats:pitchers
```

---

### 4. Collect Bullpen Statistics

`/api/fetchBullpenStats`

Retrieves pitching statistics for each MLB team's bullpen.

Metrics collected:

* Team ERA
* Team WHIP

Stored in Redis:

```
mlb:stats:bullpen
```

---

### 5. Run Prediction Model

`/api/runModel`

The prediction engine calculates win probabilities for each game using:

```
Team Elo Rating
+ Starting Pitcher Rating
+ Bullpen Strength
+ Home Field Advantage
```

Predictions are stored in Redis:

```
mlb:predictions:today
mlb:predictions:YYYY-MM-DD
```

---

### 6. Detect Betting Edges

`/api/findEdges`

The model compares predicted win probabilities to sportsbook implied probabilities.

If the model probability exceeds sportsbook probability by a threshold, the system identifies a **betting edge**.

Edges are stored in Redis:

```
mlb:edges:today
```

---

## Example Model Output

```
Atlanta Braves vs Philadelphia Phillies

Model Win Probability:
ATL 58%
PHI 42%

Sportsbook Odds:
ATL -110 (52.4%)

Edge:
ATL +5.6%
```

---

## Redis Data Structure

```
mlb:games:today
mlb:odds:today
mlb:ratings:teams
mlb:stats:pitchers
mlb:stats:bullpen
mlb:predictions:today
mlb:predictions:YYYY-MM-DD
mlb:edges:today
```

---

## Serverless Workflow

The model runs the following pipeline:

```
fetchGames
fetchOdds
fetchPitcherStats
fetchBullpenStats
runModel
findEdges
```

This produces a list of betting opportunities for the current MLB slate.

---

## Current Model Features

✔ 10+ years of historical team ratings
✔ Starting pitcher strength modeling
✔ Bullpen strength modeling
✔ Home field advantage
✔ Sportsbook odds comparison
✔ Automated edge detection
✔ Prediction history storage

---

## Disclaimer

This project is for educational and analytical purposes only.
Sports betting involves risk and should be done responsibly.
