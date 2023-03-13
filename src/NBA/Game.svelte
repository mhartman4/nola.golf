<script>
	export let game	

</script>
{JSON.stringify(game.boxscore)}


<div class="game">
	<img class="logo" src="https://cdn.nba.com/logos/nba/{game.awayId}/primary/L/logo.svg">
	<img class="logo" src="https://cdn.nba.com/logos/nba/{game.homeId}/primary/L/logo.svg">
	<br>
	<span class="score">{game.awayScore}</span>
	&nbsp;
	<span class="score">{game.homeScore}</span>
</div>



<style>
	.logo {
		width: 35px;
	}
	.game {
		background-color: white;
		margin: 10px 5px;
		border-radius: 10px;
	}
</style>