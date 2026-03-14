export function runPrediction(game){

const homeAdvantage = 0.54

const randomFactor = Math.random() * 0.1

const probability = homeAdvantage + randomFactor

return {
probability,
edge: probability - 0.5
}

}
