const MLB_TEAM_NAME_ALIASES = {
  "Arizona Diamondbacks": "Arizona Diamondbacks",
  "Atlanta Braves": "Atlanta Braves",
  "Athletics": "Oakland Athletics",
  "Baltimore Orioles": "Baltimore Orioles",
  "Boston Red Sox": "Boston Red Sox",
  "Chicago Cubs": "Chicago Cubs",
  "Chicago White Sox": "Chicago White Sox",
  "Cincinnati Reds": "Cincinnati Reds",
  "Cleveland Guardians": "Cleveland Guardians",
  "Colorado Rockies": "Colorado Rockies",
  "Detroit Tigers": "Detroit Tigers",
  "Houston Astros": "Houston Astros",
  "Kansas City Royals": "Kansas City Royals",
  "LA Angels": "Los Angeles Angels",
  "LA Dodgers": "Los Angeles Dodgers",
  "Los Angeles Angels": "Los Angeles Angels",
  "Los Angeles Dodgers": "Los Angeles Dodgers",
  "Miami Marlins": "Miami Marlins",
  "Milwaukee Brewers": "Milwaukee Brewers",
  "Minnesota Twins": "Minnesota Twins",
  "New York Mets": "New York Mets",
  "New York Yankees": "New York Yankees",
  "Oakland Athletics": "Oakland Athletics",
  "Philadelphia Phillies": "Philadelphia Phillies",
  "Pittsburgh Pirates": "Pittsburgh Pirates",
  "San Diego Padres": "San Diego Padres",
  "San Francisco Giants": "San Francisco Giants",
  "Seattle Mariners": "Seattle Mariners",
  "St. Louis Cardinals": "St. Louis Cardinals",
  "Tampa Bay Rays": "Tampa Bay Rays",
  "Texas Rangers": "Texas Rangers",
  "Toronto Blue Jays": "Toronto Blue Jays",
  "Washington Nationals": "Washington Nationals"
}

export function normalizeMlbTeamName(teamName) {
  if (!teamName || typeof teamName !== "string") {
    return null
  }

  const trimmedTeamName = teamName.trim()

  return MLB_TEAM_NAME_ALIASES[trimmedTeamName] || trimmedTeamName
}
