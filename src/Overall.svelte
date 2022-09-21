<script>
	import { onMount } from "svelte"
	import OverallTeam from "./OverallTeam.svelte"
	let overall, favoriteTeam
	let nate = window.location.search.indexOf("nate") != -1
	// export let dvLeague = false
	
	onMount(async () => {
		overall = await getOverallStandings()
		if (document.cookie.split('; ').find(row => row.startsWith('favoriteTeam'))) {
			favoriteTeam = document.cookie.split('; ').find(row => row.startsWith('favoriteTeam')).split('=')[1];	
		}
		else {
			favoriteTeam = ""
		}
	})
	function setFavorite(message) {
    	document.cookie = "favoriteTeam=" + message
    	favoriteTeam = message
    	ga('send', {
		  		hitType: 'event',
		  		eventCategory: 'Weekly',
		  		eventAction: 'Favorite',
		  		eventLabel: teamName
			});
    }
	const getOverallStandings = async () => {
		// let spreadsheet_id = "1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI"
		// let gid_overall = "1520535624"
		// let gid_earnings = "1425386487"
		
		// if (nate) {
		// 	spreadsheet_id = "1Ur-zgH5O5iwTJ3J5pUXT-hu1irNo9W5NfJwWa5RxiW0"
		// }

		// First we hit the Overall Standings sheet
		// const endpointOverall = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid_overall
		const endpointOverall = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/overall`

		const response = await fetch(endpointOverall)
		const text = await response.text()
		const raw = await JSON.parse(text.substring(47).slice(0, -2)).table
		const overallData = raw.rows.filter(r => r.c[3] != null)
		
		// Then we hit the Golfer Earnings sheet
		// const endpointGolferEarnings = `https://docs.google.com/spreadsheets/d/` + spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid_earnings
		const endpointGolferEarnings = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/golfer-earnings`

		const response2 = await fetch(endpointGolferEarnings)
		const text2 = await response2.text()
		const data = await JSON.parse(text2.substring(47).slice(0, -2)).table
		
		const cols = data.cols.map((col) => col.label)
		// Grab all the golfers
		const golfers = []
		data.rows.forEach((row) => {
			const obj = {}
			cols.forEach((col, i) => {
				obj[col] = row.c[i] == null ? null : row.c[i].v
			})
			if (obj["Team"] != null) {
				golfers.push(obj)	
			}
		})
		
		let teams = []
		// Now go through the teams and assign a roster
		overallData.forEach(t => {
			let teamObj = {
				"nameAndOwner": t.c[1].v,
				"name": t.c[1].v.replace(")", "").split(" (")[0],
				"owner": t.c[1].v.replace(")", "").split(" (")[1],
				"balance": t.c[3].v,
				"earnings": t.c[2].v,
				"roster": []
			}
			golfers.forEach(golfer => {
				if (golfer.Team == teamObj["nameAndOwner"]) {
					teamObj.roster.push({
						"name": golfer.Name,
						"earnings": golfer.Earnings
					})
				} 
			})
			teams.push(teamObj)
		})

		const sortedTeams = teams.sort((a,b) => {
			return b.earnings - a.earnings
		})
		console.log(sortedTeams)
		return sortedTeams
	}
</script>

<div class="teams">
	{#if overall}
		{#each overall as team, i}
			<table class="team" width="100%" border="0">
				<tr>
					<td>
						<OverallTeam team={team} placeNumber={i+1} isFavorite={false}></OverallTeam>	
					</td>
				</tr>
			</table>
			
		{/each}
	{:else}
		<img class="sheets-icon" src="https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png"><span>&nbsp;Loading overall standings</span>
	{/if}
</div>

<style>
	.favorite-cell {
		vertical-align: top;
	  	padding-top: 22px;
	}
	.team {
    	margin: 5px 0px;
    	border-radius: 4px;
    	border: 1px solid #ddd;
    	background-color: white;
  	}
  	.panel-group {
	    margin-bottom: 20px;
		border-radius: 4px;
	}
</style>