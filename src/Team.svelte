<script>
	import Roster from "./Roster.svelte"
	export let team, placeNumber, isFavorite
	
	// let teamName = team.name
	// let teamNameNoOwner = team.teamName
	// let owner = team.owner
	let pictureUrl = "https://pga-tour-res.cloudinary.com/image/upload/c_fill,dpr_2.0,f_auto,g_face:center,h_45,q_auto,t_headshots_leaderboard_l,w_45/headshots_" + team.roster[0].id + ".png"
    let rosterVisible = false
    let dvLeague = window.location.href.includes("?league=dv")

    function toggleRoster() {
    	rosterVisible = !rosterVisible
    	if (rosterVisible) {
		  	ga('send', {
		  		hitType: 'event',
		  		eventCategory: 'Weekly',
		  		eventAction: 'Click Team',
		  		eventLabel: team.name
			});
    	}
  
    }

</script>


<div class="team">
	<div class="header" on:click={toggleRoster}>
		<table border="0" width="100%">
			<tbody>
				<tr>
					<td class="standings-place-number" width="15">{placeNumber}</td>
					<td width="55">
						<img class="player-photo" src="{pictureUrl}" width="45" height="45">
					</td>
					<td class="team-name {isFavorite ? " favorite" : ""}">
						{team.teamName}
						<div class="owner {dvLeague ? " invisible" : ""}">{team.owner}</div>
					</td>
					<td class="team-earnings {isFavorite ? " favorite" : ""}">
						{numeral(team.totalMoney).format('$0,0')}<br>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
	{#if rosterVisible}
		<Roster roster={team.roster} teamName={team.teamName}></Roster>
	{/if}
</div>


<style>
	
  	.header {
  		padding: 5px 2px;
  	}
	.standings-place-number {
	    color: black;
	    margin: 0px 5px;
	    /*padding-left: 5px;*/
	    font-size: 12px;
	    text-align: left;
	}
	.player-photo {
    	margin-right: 8px;
    	margin-left: 4px;
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
	    font-size: 16px;
	    padding: 0px 0px;
	    text-align: right;
	}
	.favorite {
		color: #de0000;
	}
	.invisible {
		display: none;
	}
</style>