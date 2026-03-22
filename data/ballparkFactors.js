export const BALLPARK_FACTOR_SOURCE = {
  name: "Bundled Statcast-style park factor baseline",
  description: "Approximate normalized park factors curated from recent Statcast/FanGraphs-style run environments for current MLB home venues.",
  season: 2025,
  scale: "1.00 = league average",
  notes: "Used as the default fallback when no external ballpark factor feed is configured."
}

export const BALLPARK_FACTOR_BASELINES = [
  {
    venue: "Chase Field",
    homeTeams: ["Arizona Diamondbacks"],
    runFactor: 1.04,
    homeRunFactor: 1.07,
    hitsFactor: 1.02,
    doublesTriplesFactor: 1.05,
    leftHandedHitterFactor: 1.03,
    rightHandedHitterFactor: 1.02
  },
  {
    venue: "Truist Park",
    homeTeams: ["Atlanta Braves"],
    runFactor: 1.02,
    homeRunFactor: 1.05,
    hitsFactor: 1.01,
    doublesTriplesFactor: 1.0,
    leftHandedHitterFactor: 1.03,
    rightHandedHitterFactor: 1.02
  },
  {
    venue: "Oriole Park at Camden Yards",
    aliases: ["Camden Yards"],
    homeTeams: ["Baltimore Orioles"],
    runFactor: 0.97,
    homeRunFactor: 0.89,
    hitsFactor: 1.01,
    doublesTriplesFactor: 1.04,
    leftHandedHitterFactor: 0.92,
    rightHandedHitterFactor: 0.98
  },
  {
    venue: "Fenway Park",
    homeTeams: ["Boston Red Sox"],
    runFactor: 1.06,
    homeRunFactor: 0.98,
    hitsFactor: 1.09,
    doublesTriplesFactor: 1.21,
    leftHandedHitterFactor: 1.02,
    rightHandedHitterFactor: 1.08
  },
  {
    venue: "Wrigley Field",
    homeTeams: ["Chicago Cubs"],
    runFactor: 1.01,
    homeRunFactor: 1.03,
    hitsFactor: 1.0,
    doublesTriplesFactor: 1.01,
    leftHandedHitterFactor: 1.01,
    rightHandedHitterFactor: 1.01
  },
  {
    venue: "Rate Field",
    aliases: ["Guaranteed Rate Field", "U.S. Cellular Field"],
    homeTeams: ["Chicago White Sox"],
    runFactor: 1.02,
    homeRunFactor: 1.11,
    hitsFactor: 0.99,
    doublesTriplesFactor: 0.97,
    leftHandedHitterFactor: 1.04,
    rightHandedHitterFactor: 1.03
  },
  {
    venue: "Great American Ball Park",
    homeTeams: ["Cincinnati Reds"],
    runFactor: 1.08,
    homeRunFactor: 1.18,
    hitsFactor: 0.99,
    doublesTriplesFactor: 0.94,
    leftHandedHitterFactor: 1.12,
    rightHandedHitterFactor: 1.08
  },
  {
    venue: "Progressive Field",
    homeTeams: ["Cleveland Guardians"],
    runFactor: 0.99,
    homeRunFactor: 0.97,
    hitsFactor: 1.0,
    doublesTriplesFactor: 1.01,
    leftHandedHitterFactor: 0.98,
    rightHandedHitterFactor: 0.99
  },
  {
    venue: "Coors Field",
    homeTeams: ["Colorado Rockies"],
    runFactor: 1.14,
    homeRunFactor: 1.1,
    hitsFactor: 1.18,
    doublesTriplesFactor: 1.32,
    leftHandedHitterFactor: 1.11,
    rightHandedHitterFactor: 1.12
  },
  {
    venue: "Comerica Park",
    homeTeams: ["Detroit Tigers"],
    runFactor: 1.01,
    homeRunFactor: 0.93,
    hitsFactor: 1.05,
    doublesTriplesFactor: 1.15,
    leftHandedHitterFactor: 0.99,
    rightHandedHitterFactor: 1.03
  },
  {
    venue: "Daikin Park",
    aliases: ["Minute Maid Park"],
    homeTeams: ["Houston Astros"],
    runFactor: 1.01,
    homeRunFactor: 1.02,
    hitsFactor: 1.0,
    doublesTriplesFactor: 0.99,
    leftHandedHitterFactor: 1.06,
    rightHandedHitterFactor: 0.98
  },
  {
    venue: "Kauffman Stadium",
    homeTeams: ["Kansas City Royals"],
    runFactor: 0.96,
    homeRunFactor: 0.84,
    hitsFactor: 1.04,
    doublesTriplesFactor: 1.17,
    leftHandedHitterFactor: 0.95,
    rightHandedHitterFactor: 0.97
  },
  {
    venue: "Angel Stadium",
    aliases: ["Angel Stadium of Anaheim"],
    homeTeams: ["Los Angeles Angels"],
    runFactor: 0.98,
    homeRunFactor: 1.0,
    hitsFactor: 0.98,
    doublesTriplesFactor: 0.97,
    leftHandedHitterFactor: 1.05,
    rightHandedHitterFactor: 0.97
  },
  {
    venue: "Dodger Stadium",
    homeTeams: ["Los Angeles Dodgers"],
    runFactor: 0.97,
    homeRunFactor: 0.95,
    hitsFactor: 0.98,
    doublesTriplesFactor: 0.96,
    leftHandedHitterFactor: 0.98,
    rightHandedHitterFactor: 0.96
  },
  {
    venue: "loanDepot park",
    aliases: ["Marlins Park"],
    homeTeams: ["Miami Marlins"],
    runFactor: 0.94,
    homeRunFactor: 0.87,
    hitsFactor: 0.97,
    doublesTriplesFactor: 0.99,
    leftHandedHitterFactor: 0.92,
    rightHandedHitterFactor: 0.95
  },
  {
    venue: "American Family Field",
    aliases: ["Miller Park"],
    homeTeams: ["Milwaukee Brewers"],
    runFactor: 1.03,
    homeRunFactor: 1.07,
    hitsFactor: 1.0,
    doublesTriplesFactor: 0.98,
    leftHandedHitterFactor: 1.05,
    rightHandedHitterFactor: 1.02
  },
  {
    venue: "Target Field",
    homeTeams: ["Minnesota Twins"],
    runFactor: 1.0,
    homeRunFactor: 1.01,
    hitsFactor: 1.0,
    doublesTriplesFactor: 1.0,
    leftHandedHitterFactor: 1.0,
    rightHandedHitterFactor: 1.0
  },
  {
    venue: "Citi Field",
    homeTeams: ["New York Mets"],
    runFactor: 0.96,
    homeRunFactor: 0.93,
    hitsFactor: 0.98,
    doublesTriplesFactor: 0.98,
    leftHandedHitterFactor: 0.95,
    rightHandedHitterFactor: 0.97
  },
  {
    venue: "Yankee Stadium",
    homeTeams: ["New York Yankees"],
    runFactor: 1.03,
    homeRunFactor: 1.12,
    hitsFactor: 1.0,
    doublesTriplesFactor: 0.95,
    leftHandedHitterFactor: 1.16,
    rightHandedHitterFactor: 1.0
  },
  {
    venue: "Sutter Health Park",
    aliases: ["Oakland Coliseum", "RingCentral Coliseum", "Oakland-Alameda County Coliseum"],
    homeTeams: ["Athletics", "Oakland Athletics"],
    runFactor: 1.05,
    homeRunFactor: 1.08,
    hitsFactor: 1.03,
    doublesTriplesFactor: 1.01,
    leftHandedHitterFactor: 1.05,
    rightHandedHitterFactor: 1.04
  },
  {
    venue: "Citizens Bank Park",
    homeTeams: ["Philadelphia Phillies"],
    runFactor: 1.03,
    homeRunFactor: 1.09,
    hitsFactor: 1.0,
    doublesTriplesFactor: 0.97,
    leftHandedHitterFactor: 1.07,
    rightHandedHitterFactor: 1.02
  },
  {
    venue: "PNC Park",
    homeTeams: ["Pittsburgh Pirates"],
    runFactor: 0.96,
    homeRunFactor: 0.91,
    hitsFactor: 0.98,
    doublesTriplesFactor: 1.03,
    leftHandedHitterFactor: 0.94,
    rightHandedHitterFactor: 0.97
  },
  {
    venue: "Petco Park",
    homeTeams: ["San Diego Padres"],
    runFactor: 0.95,
    homeRunFactor: 0.92,
    hitsFactor: 0.97,
    doublesTriplesFactor: 0.98,
    leftHandedHitterFactor: 0.94,
    rightHandedHitterFactor: 0.96
  },
  {
    venue: "Oracle Park",
    aliases: ["AT&T Park", "SBC Park"],
    homeTeams: ["San Francisco Giants"],
    runFactor: 0.94,
    homeRunFactor: 0.85,
    hitsFactor: 0.99,
    doublesTriplesFactor: 1.08,
    leftHandedHitterFactor: 0.89,
    rightHandedHitterFactor: 0.95
  },
  {
    venue: "T-Mobile Park",
    aliases: ["Safeco Field"],
    homeTeams: ["Seattle Mariners"],
    runFactor: 0.95,
    homeRunFactor: 0.91,
    hitsFactor: 0.97,
    doublesTriplesFactor: 0.98,
    leftHandedHitterFactor: 0.94,
    rightHandedHitterFactor: 0.96
  },
  {
    venue: "Busch Stadium",
    homeTeams: ["St. Louis Cardinals"],
    runFactor: 0.97,
    homeRunFactor: 0.92,
    hitsFactor: 0.99,
    doublesTriplesFactor: 1.01,
    leftHandedHitterFactor: 0.96,
    rightHandedHitterFactor: 0.98
  },
  {
    venue: "George M. Steinbrenner Field",
    aliases: ["Tropicana Field"],
    homeTeams: ["Tampa Bay Rays"],
    runFactor: 1.04,
    homeRunFactor: 1.06,
    hitsFactor: 1.02,
    doublesTriplesFactor: 1.01,
    leftHandedHitterFactor: 1.04,
    rightHandedHitterFactor: 1.03
  },
  {
    venue: "Globe Life Field",
    homeTeams: ["Texas Rangers"],
    runFactor: 0.99,
    homeRunFactor: 0.97,
    hitsFactor: 1.0,
    doublesTriplesFactor: 0.99,
    leftHandedHitterFactor: 0.99,
    rightHandedHitterFactor: 0.99
  },
  {
    venue: "Rogers Centre",
    aliases: ["Rogers Center"],
    homeTeams: ["Toronto Blue Jays"],
    runFactor: 1.04,
    homeRunFactor: 1.09,
    hitsFactor: 1.01,
    doublesTriplesFactor: 0.98,
    leftHandedHitterFactor: 1.05,
    rightHandedHitterFactor: 1.03
  },
  {
    venue: "Nationals Park",
    homeTeams: ["Washington Nationals"],
    runFactor: 1.0,
    homeRunFactor: 1.01,
    hitsFactor: 1.0,
    doublesTriplesFactor: 1.0,
    leftHandedHitterFactor: 1.0,
    rightHandedHitterFactor: 1.0
  }
]
