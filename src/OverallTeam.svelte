<script>
	import OverallRoster from "./OverallRoster.svelte"
	export let team, placeNumber, isFavorite
    let rosterVisible = false
    let dvLeague = window.location.href.includes("?league=dv")

    function toggleRoster() {
    	rosterVisible = !rosterVisible
    	if (rosterVisible) {
		  	ga('send', {
		  		hitType: 'event',
		  		eventCategory: 'Overall',
		  		eventAction: 'Click Team',
		  		eventLabel: team.name
			});
    	}
    }

</script>

<div class="team">
	<div class="team" on:click={toggleRoster}>
		<div class="header">
			<table border="0" width="100%">
				<tbody>
					<tr>
						<td class="standings-place-number" width="20">{placeNumber}</td>
						<td width="50" align="left">
							<span class="team-total-payout { team.balance < 0 ? 'negative' : ''}">{numeral(team.balance).format("$0")}</span>
						</td>
						<td class="team-name{isFavorite ? " favorite" : ""}">
							{team.name}
							<div class="owner {dvLeague ? " invisible" : ""}">{team.owner}</div>
						</td>
						<td class="team-earnings{isFavorite ? " favorite" : ""}">
							{numeral(team.earnings).format('$0,0')}<br>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		{#if rosterVisible}
			<OverallRoster roster={team.roster}></OverallRoster>
		{/if}
	</div>
</div>


<style>
	.team {
    	margin: 5px 0px;
    	border-radius: 4px;
    	/*border: 1px solid #ddd;*/
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
	.player-photo {
    	margin: 0px 8px;
 	}
	.team-name {
	    font-size: 16px;
	    margin: 0px 8px;
	    color: #46404A;
	    text-align: left;
	}
	.owner {
	    color: lightslategrey;
	    font-size: 12px;
	    font-family: "Roboto";
	}
	.team-earnings {
	    color: #46404A;
	    font-size: 15px;
	    padding: 0px 0px;
	    text-align: right;
	}
	.team-total-payout {
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
	.negative {
		background-color: #d9534f;
	}
	.favorite {
		color: #de0000;
	}
</style>