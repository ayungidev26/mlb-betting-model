import { useEffect, useState } from "react"

export default function Home() {

const [games,setGames] = useState([])

useEffect(()=>{

fetch("/api/runModel")
.then(res=>res.json())
.then(data=>setGames(data))

},[])

return (

<div>

<h1>MLB Betting Model</h1>

{games.map(game => (

<div key={game.gamePk}>

Game {game.gamePk}

Edge: {game.prediction.edge}

</div>

))}

</div>

)

}
