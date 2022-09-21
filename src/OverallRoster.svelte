<script>
	import { slide } from 'svelte/transition'
	export let roster
</script>

<style>
	.roster {
		margin-bottom: 10px;
	}
	.roster-table {
		margin: 0 auto;
		border-spacing: 0;
	    border-collapse: collapse;
	}
	.roster-header {
		font-family: "Fjalla One";
	    border-bottom: 1px solid black;
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
</style>
<div class="roster" transition:slide>
	<table class="roster-table">
		<thead>
			<tr>
				<th class='roster-header'>Golfer</th>
                <th class='roster-header'>Earnings</th>
			</tr>
		</thead>
		<tbody>
			{#each roster as player}
				<tr class="player-row">
					<td>{player.name}</td>
					<td>{numeral(player.earnings).format('$0,0')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>