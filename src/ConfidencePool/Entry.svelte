<script>
	import Pick from "./Pick.svelte"
	import { slide } from 'svelte/transition'
	export let entry,pointswon,pointsremaining,placenumber,picks
	let teamName = entry.slice(0, -1).split(" (")[0]
	let owner = entry.slice(0, -1).split(" (")[1]
	let picksVisible = false
	let points = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43]
	let picks_no_champs = picks.filter((element, index) => index < picks.length - 1);

	function togglePicks() {
    	picksVisible = !picksVisible
    	if (picksVisible) {
		  	ga('send', {
		  		hitType: 'event',
		  		eventCategory: 'Confidence Pool',
		  		eventAction: 'Click Picks',
		  		eventLabel: entry
			});
    	}
    }
</script>
<div class="team">
	<div class="team" on:click={togglePicks}>
		<div class="header">
			<table border="0" width="100%">
				<tbody>
					<tr>
						<td class="standings-place-number" width="20">{placenumber}</td>
						<td class="team-name">
							{teamName}
							<div class="owner">{owner}</div>
						</td>
						<td align="right">
							<span class="pointswon">{pointswon} pts</span>
							<span class="pointsremaining">{pointsremaining} left</span>
							<!-- <span class="pointshighestpossible">{pointswon + pointsremaining} total</span> -->
						</td>
					</tr>
				</tbody>
			</table>
			<div class="point-picks">
					{#each points as point}
						{#each picks_no_champs as pick}
							{#if pick["Wager"] === point}
								<span class="point-value {pick['Points Won'] > 0 ? 'pickwon' : pick['Points Lost'] > 0 ? 'picklost' : ''} ">
									{point}
								</span>
							{/if}
						{/each}
					{/each}
			</div>
		</div>
		
		{#if picksVisible}
			
			<div class="roster" transition:slide>
				<table class="roster-table">
					<thead>
						<tr>
							<th class='roster-header'>Team</th>
			                <th class='roster-header'>Wager</th>
						</tr>
					</thead>
					<tbody>
					{#each picks as pick}
						<Pick entry={pick['Entry']} team={pick['Team']} wager={pick['Wager']} pointswon={pick['Points Won']} pointslost={pick['Points Lost']}/>
					{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
<style>
	.team {
    	margin: 5px 0px;
    	border-radius: 4px;
    	background-color: white;	
  	}
  	.header {
  		padding: 5px 2px;
  	}
	.standings-place-number {
	    color: black;
	    padding-left: 5px;
	    padding-top: 6px;
	    font-size: 12px;
	    text-align: left;
	}
	.team-name {
	    font-size: 16px;
	    margin: 0px 8px;
	    color: #46404A;
	    text-align: left;
	    width: 60%;
	}
	.owner {
	    color: lightslategrey;
	    font-size: 12px;
	    font-family: "Roboto";
	}
	.pointswon {
	    background-color: #7bbb5e;
    	color: white;
    	font-family: "Roboto";
    	padding: .2em .2em .2em;
    	font-size: 12px;
    	display: inline;
    	font-weight: 700;
    	line-height: 1;
    	border-radius: .25em;
	}
	.pointsremaining {
		background-color: lightslategrey;
    	color: white;
    	font-family: "Roboto";
    	padding: .2em .2em .2em;
    	font-size: 12px;
    	display: inline;
    	font-weight: 700;
    	line-height: 1;
    	border-radius: .25em;
	}
	.pointshighestpossible {
		background-color: black;
    	color: white;
    	font-family: "Roboto";
    	padding: .2em .2em .2em;
    	font-size: 12px;
    	display: inline;
    	font-weight: 700;
    	line-height: 1;
    	border-radius: .25em;
	}
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
	    /*border-bottom: 1px solid black;*/
	    text-transform: uppercase;
	    font-size: 12px;
	    text-decoration: none;

	}
	.player-row {
		font-size: 10px;
		font-family: "Roboto";
		padding: 5px;
	}
	.point-picks {
		display: block;
		width: 100%;
		text-align: left;
	}
	.point-value {
		display: inline-block;
	    padding: 0.25em 0.4em;
	    font-size: 10px;
	    line-height: 1;
	    text-align: center;
	    white-space: nowrap;
	    vertical-align: baseline;
	    border-radius: 0.25rem;
	    background-color: darkgray;
	    color: white;
	    font-family: "Roboto";
	    font-size: 9px;
	    margin: 1px 0px;
	}
	.pickwon {
		background-color: #7bbb5e;
	}
	.picklost {
		background-color: #dc3545;
	}
	
</style>