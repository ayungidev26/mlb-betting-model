export function calculatePitcherRating(name) {

  if (!name) return 0

  const elite = [
    "Gerrit Cole",
    "Spencer Strider",
    "Zack Wheeler",
    "Corbin Burnes",
    "Max Fried"
  ]

  const good = [
    "Aaron Nola",
    "Logan Webb",
    "Luis Castillo",
    "Blake Snell"
  ]

  if (elite.includes(name)) return 80
  if (good.includes(name)) return 40

  return 0
}
