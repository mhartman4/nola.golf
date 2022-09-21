<script>
	import { slide } from 'svelte/transition'
	export let roster, teamName
</script>

<div class="roster" transition:slide>
	<table class="roster-table">
		<thead>
			<tr>
				<th class='roster-header'>Golfer</th>
                <th class='roster-header'>Proj. $</th>
                <th class='roster-header'>Pos</th>
                <th class='roster-header'>Total</th>
                <th class='roster-header'>Today</th>
                <th class='roster-header'>Thru</th>
			</tr>
		</thead>
		<tbody>
			{#each roster as player}
				<!-- {#if player.isPlaying} -->
					<tr class="player-row{player.isPlaying ? '' : ' inactive'}{player.secondTourney ? ' second-tourney' : ''}{' ' + player.pgaStatus}">
						<td>{player.name}</td>
	                    <td>{player.position ? numeral(player.projMoney).format("$0,0") : ""}</td>
	                    <td>{player.isPlaying ? (player.position ? player.position : (player.pgaStatus === "wd" ? "WD" : (player.pgaStatus == "active" ? "" : "CUT"))) : ""}</td>
	                    <td>{player.position ? (player.total ? player.total : "E") : ""}</td>
	                    <td>{player.today == null ? (player.pgaStatus == "active" ? player.firstRoundTeeTime : "") : (player.today != undefined ? (player.today == 0 ? "E" : player.today) : "")}</td>
	                    <td>{player.thru ? player.thru : ""}</td>
					</tr>
				<!-- {/if} -->
			{/each}
		</tbody>
	</table>
</div>

<style>
	.roster {
		margin-bottom: 10px;
	}
	.roster-table {
		margin: 0 auto;
		border-spacing: 0;
	    border-collapse: collapse;
	    width: 100%;
	}
	.roster-header {
		font-family: "Fjalla One";
	    background-color: black;
	    color: white;
	    text-transform: uppercase;
	    font-size: 10px;
	    text-decoration: none;

	}
	.player-row {
		font-size: 10px;
		font-family: "Roboto";
		padding: 5px;
	}
	td {
		padding: 5px;
	}
	.active {
		background-color: white;
	}
	.second-tourney {
		background-color: #fff2cc;
	}
	.cut {
		background-color: #ea9999;
	}
	.wd {
		background-color: #ea9999;
	}
	.inactive {
		background-color: #dedede;
		display: none;
	}
	.favorite-button {
		margin: 5px;
	}
</style>