<script>
	import { onMount } from "svelte"
	import Game from "./Game.svelte"
	
	let games = []
	let boxscores = []
	let gameDate = "2023-01-17"
	let requestHeaders = {method: 'GET',headers: {"x-api-key": "3jpk6unmf43xzfx6"}}
	
	onMount(async () => {
		try {
			getGames(gameDate)
		}
		catch (e) {
			error = e
		}
		
	})

	const getGames = async (gameDate) => {
    	const response = await fetch(`http://api.ngss.nba.com:9000/Leagues/00/games?FromDate=2023-01-17&ToDate=2023-01-18&Limit=500`, requestHeaders)
		const json = await response.json()
		var gameResults = json.data
		gameResults.forEach(game => {
			getBoxScore(game)
		})
		var final = gameResults
		// console.log(gameResults)
		games = await gameResults
	}
	const getBoxScore = async (game) => {
			const response = await fetch(`http://api.ngss.nba.com:9000/games/` + game.gameId + `/boxscorereport?Format=json&language=en_US`, requestHeaders)
			const json = await response.json()
			game.boxscore = json.data	
	}
</script>
<!-- {JSON.stringify(games)} -->

{gameDate}
{#if games != []}
	{#each games as game}
		<Game game={game}  />
	{/each}
{/if}

<style>

</style>