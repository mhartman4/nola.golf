<script>
  	import { onMount } from "svelte"
	import Team from "./Team.svelte"
	import moment from "moment"
	import ResultsTable from "./ResultsTable.svelte"
	let teams, leaderboard, favoriteTeam, blurb, tournaments, golfers, rawTeams, processedTeams
	let tourneyName, livTourneyName, eurTourneyName
	let resultsPlayers = []
	let rawResults = window.location.href.includes("results")
	let error
	// onMount do all of our async functions
	onMount(async () => {


		try {
			rawTeams = await getTeamRosters()
			
			teams = await hitESPN(rawTeams, "pga")
			teams = await hitESPN(rawTeams, "liv")
			teams = await hitESPN(rawTeams, "eur")
			
			await teams.sort((a,b) => b.totalMoney - a.totalMoney )
			
			teams.forEach(team => {
				team.roster = team.roster.sort((a,b) => b.sort - a.sort)
			})
		}
		catch (e) {
			error = e
		}
		
	})


    // Hit ESPN for the standings
    const hitESPN = async (rawTeams, leagueSlug) => {
    	const endpoint = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=` + leagueSlug
    	const response = await fetch(endpoint)
		const json = await response.json()
		// console.log(json)

		if (json.events.length == 0 || json.events[0].name == "Hero Cup") {
			var dateDiff = -100

		}
		else {
			var dateDiff = Math.floor((new Date() - Date.parse(json.events[0].endDate)) / (1000*60*60*24))
		}	

		if (dateDiff >= -4 && dateDiff <= 4) {
			switch(leagueSlug) {
			  case "pga":
			    tourneyName = json.events[0].name
			    break;
			  case "liv":
			    livTourneyName = json.events[0].name
			    break;
			  case "eur":
			    eurTourneyName = json.events[0].name
			    break;
			}

    		golfers = json.events[0].competitions[0].competitors	
		
			golfers = golfers.sort((a,b) => {
				return Number(a.status.position.id) - Number(b.status.position.id)
			})
			
			var purse = json.events[0].purse
			var payoutPercentages = [null, 0.18,0.109,0.069,0.049,0.041,0.03625,0.03375,0.03125,0.02925,0.02725,0.02525,0.02325,0.02125,0.01925,0.01825,0.01725,0.01625,0.01525,0.01425,0.01325,0.01225,0.01125,0.01045,0.00965,0.00885,0.00805,0.00775,0.00745,0.00715,0.00685,0.00655,0.00625,0.00595,0.0057,0.00545,0.0052,0.00495,0.00475,0.00455,0.00435,0.00415,0.00395,0.00375,0.00355,0.00335,0.00315,0.00295,0.00279,0.00265,0.00257,0.00251,0.00245,0.00241,0.00237,0.00235,0.00233,0.00231,0.00229,0.00227,0.00225,0.00223,0.00221,0.00219,0.00217,0.00215]
			const livPayoutPercentages = [null, 0.20000,0.10625,0.07500,0.05250,0.04875,0.04000,0.03375,0.03125,0.02900,0.02800,0.02700,0.02250,0.01800,0.01350,0.01250,0.01200,0.01160,0.01130,0.01100,0.01000,0.00900,0.00860,0.00850,0.00840,0.00830,0.00820,0.00810,0.00800,0.00790,0.00780,0.00770,0.00760,0.00750,0.00740,0.00730,0.00720,0.00710,0.00700,0.00690,0.00680,0.00670,0.00660,0.00650,0.00640,0.00630,0.00620,0.00610,0.00600]
			golfers.forEach((g) => {
				if (leagueSlug == "liv") {
					g.estimatedEarnings = livPayoutPercentages[g.status.position.id] * purse * 0.27
				}
				else {
					g.estimatedEarnings = payoutPercentages[g.status.position.id] * 18000000 		
				}

				if (isNaN(g.estimatedEarnings)) {
					g.estimatedEarnings = 0
				}
			})

			const golferIds = await golfers.map((g) => g.id)
			
			rawTeams.forEach(team => {
				team.roster.forEach(player => {
					const matches = golfers.filter( g => g.id == player.espnId)
					if (matches.length > 0) {
						const golfer = matches[0]
						console.log(golfer)
						player.isPlaying = true
						player.position = golfer.status.position.displayName
						player.projMoney = golfer.estimatedEarnings
						if (golfer.estimatedEarnings) {
							team.totalMoney += golfer.estimatedEarnings
						}

						player.pgaStatus = golfer.status.shortDetail
						player.total = golfer.score.displayValue
						player.today = golfer.linescores.at(-1).displayValue					
						player.thru = golfer.status.thru
						player.league = leagueSlug
						player.sort = golfer.estimatedEarnings
						team.activeGolferCounts[leagueSlug] += 1

					}
					
				})

			})
    	}
    	console.log(rawTeams)
    	return rawTeams	
		
    }

    
	
	// Get our team rosters from the Google Sheet / KVDB
	const getTeamRosters = async () => {
		
		
		let spreadsheet_id = "1VZLmb-iqnxo3Xvin1hGNBxLGK4361bIkS_LAzQNhdCM"
		let gid = "775252902"
		
				
		let endpoint = `https://docs.google.com/spreadsheets/d/`+ spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid
		// let endpoint = "https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/rosters" + "?timestamp=" + Date.now()

		const response = await fetch(endpoint)
		const text = await response.text()
		const data = await JSON.parse(text.substring(47).slice(0, -2)).table
		
		const cols = data.cols.map((col) => col.label)
		
		// Grab all the players
		const players = []
		data.rows.forEach((row) => {
			const obj = {}
			cols.forEach((col, i) => {
				obj[col] = row.c[i] == null ? null : row.c[i].v
			})
			if (obj["Team"] != null && obj["Team"] != " ()") {
				players.push(obj)	
			}
		})


		
		// Get unique team names
		let teamNames = [...new Set(players.map((p) => p.Team))]
		// Assign rosters to teams
		let teams = []
		teamNames.forEach((team) => {
			let obj = {
				"teamName": team.replace(")", "").split(" (")[0],
				"owner": team.replace(")", "").split(" (")[1],
				"roster": []
			}
			players.forEach((player) => {
				if (player.Team == team) {
					obj.roster.push({
						"id": player.PGAID + "",
						"name": player.Golfers,
						"espnId": player.ESPNID
					})
				}
			})
			teams.push(obj)
		})
		teams.forEach(t => t.totalMoney = 0)
		teams.forEach(t => {
			t.roster.forEach(p => p.sort = 0)
			t.activeGolferCounts = {["pga"]: 0, ["liv"]: 0, ["eur"]: 0}
		})

		return teams		

	}

</script>
<br>
{#if tourneyName}
	<h1 class="tourney-name">PGA Pool Projected Standings</h1>
{:else}
	<img class="sheets-icon" src="https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png" alt="Loading"><span>&nbsp;Loading current tournament</span>
{/if}
{#if livTourneyName}<h1 class="tourney-name liv">{livTourneyName}</h1>{/if}
{#if eurTourneyName}<h1 class="tourney-name eur">{eurTourneyName}</h1>{/if}
<div class="teams">
	{#if teams}
		{#each teams as team, i}
			<table class="team" width="100%" border="0">
				<tr>
					<td>
						<Team team={team} placeNumber={i+1} isFavorite={false} activeGolferCounts="TEST!"></Team>	
					</td>
				</tr>
			</table>
	  	{/each}
	{:else if error}
		<div class="error">
			<code>🚨 {error} 🚨</code>
		</div>
	{:else}
		<img class="sheets-icon" src="https://a.espncdn.com/favicon.ico" alt="Loading"><span>&nbsp;Scraping ESPN</span>
	{/if}
</div>

<div>
	<a href="{window.location.origin + window.location.pathname + '?pellepga&v=' + new Date().valueOf()}">🔄</a>
</div>
<br>
<br>

<style>
	a:link {
		text-decoration: none;
		color: black;
	}
	a:visited {
  		color: black;
	}
	.tourney-name {
	  font-size: 18px;
	  text-align: center;
	  text-transform: uppercase;
	  margin: 2px;
	  font-weight: normal;
	}
	.panel-group {
	    margin-bottom: 20px;
		border-radius: 4px;
	}
	.team {
    	margin: 5px 0px;
    	border-radius: 4px;
    	border: 1px solid #ddd;
    	background-color: white;
  	}
  	.favorite-cell {
  		vertical-align: top;
  		padding-top: 22px;
  	}
  	.error {
  		color: red;
  		background-color: white;
  		padding: 10px;
  	}
  	.liv {
		color: #0b5394;
	}
	.eur {
		color: #e69138;
	}
</style>