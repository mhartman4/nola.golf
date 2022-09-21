<script>
	export let entry,team,wager,pointswon,pointslost
	let pickstatus = pointswon > 0 ? "won" : pointslost >0 ? "lost" : "notplayed"
</script>

<tr class="player-row">
	<td class="{pickstatus}">{team}</td>
	<td class="{pickstatus}">{wager}</td>
</tr>

<style>
	
	
	.player-row {
		font-size: 12px;
		font-family: "Roboto";
		padding: 5px;
	}
	td {
		padding: 5px;
	}
	.won {
		color: green;
	}
	.lost {
		color: red;
	}

</style>