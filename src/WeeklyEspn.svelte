<script>
  	import { onMount } from "svelte"
	import Team from "./Team.svelte"
	import moment from "moment"
	import ResultsTable from "./ResultsTable.svelte"
	let teams, tourneyName, leaderboard, favoriteTeam, blurb, tournaments, golfers, rawTeams, processedTeams
	let resultsPlayers = []
	let rawResults = window.location.href.includes("results")
	let error
	// onMount do all of our async functions
	onMount(async () => {

		try {
			rawTeams = await getTeamRosters()
			processedTeams = await hitESPN(rawTeams)
			processedTeams = await sortTeams(processedTeams)			
		}
		catch (e) {
			error = e
		}
		
	})


	// Hit the google sheet for the schedule
	const getRelevantTournament = async () => {
				
		const endpoint = `https://docs.google.com/spreadsheets/d/1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50/gviz/tq?tqx=out:json&tq&gid=61191989`
		
		// const endpoint = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/schedule` + "?timestamp=" + Date.now()
		const response = await fetch(endpoint)
		const text = await response.text()
		const data = await JSON.parse(text.substring(47).slice(0, -2)).table
  		const today = new Date()

  		const tourneysBeforeToday = data.rows.filter(event => new Date(Date.parse(event.c[1].f)) < today.setHours(0,0,0,0))
  		const tournaments = []
  		const payoutPercentages = [null, 0.18,0.109,0.069,0.049,0.041,0.03625,0.03375,0.03125,0.02925,0.02725,0.02525,0.02325,0.02125,0.01925,0.01825,0.01725,0.01625,0.01525,0.01425,0.01325,0.01225,0.01125,0.01045,0.00965,0.00885,0.00805,0.00775,0.00745,0.00715,0.00685,0.00655,0.00625,0.00595,0.0057,0.00545,0.0052,0.00495,0.00475,0.00455,0.00435,0.00415,0.00395,0.00375,0.00355,0.00335,0.00315,0.00295,0.00279,0.00265,0.00257,0.00251,0.00245,0.00241,0.00237,0.00235,0.00233,0.00231,0.00229,0.00227,0.00225,0.00223,0.00221,0.00219,0.00217,0.00215]
  		// grab the last tournament but check if any others have the same date
  		tourneysBeforeToday.forEach((t) => {
			if (tourneysBeforeToday.slice(-1)[0].c[1].f === t.c[1].f) {
				
				tournaments.push(
					{
						"id": t.c[2].v,
						"name": t.c[0].v,
						"espnId": t.c[4].v,
						"totalPurse": t.c[3].v / 0.18,
						"payouts": payoutPercentages.map((n) => n * (t.c[3].v / 0.18))
					}
				)
			}
		})
		tourneyName = tournaments.map((t) => t.name).join(" / ")

		return tournaments;
	}

    // Hit ESPN for the standings
    const hitESPN = async (rawTeams) => {
    	const endpoint = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=401465496` 
    	// Get current tourney!
    	// https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=eur
    	// https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga
    	// https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=liv
    	const response = await fetch(endpoint)
		const json = await response.json()
		tourneyName = json.events[0].name
		golfers = json.events[0].competitions[0].competitors
		
		const golferIds = await golfers.map((g) => g.id)
		
		// console.log(matches)
		// console.log(golfers)
		
		rawTeams.forEach(team => {
			team.totalMoney = 0
			team.roster.forEach(player => {
				// console.log(player)
				const matches = golfers.filter( g => g.id == player.espnId)	
				if (matches.length > 0) {
					const golfer = matches[0]
					// console.log(golfer)
					player.isPlaying = true
					player.position = golfer.status.position.displayName
					player.projMoney = golfer.earnings
					if (golfer.earnings) {
						team.totalMoney += golfer.earnings	
					}
					player.pgaStatus = golfer.status.shortDetail
					player.total = golfer.score.displayValue
					player.today = golfer.status.type.shortDetail
					player.thru = golfer.status.thru
					// player.firstRoundTeeTime = 

				}
				else {
					player.isPlaying = false
				}
				
			})

		})
		console.log(rawTeams)
		return rawTeams
    }

    const sortTeams = async (processedTeams) => {
    	processedTeams.forEach(team => {
    		team.placeNumber = 0
    		team.isFavorite = false
    	})
    	const sortedTeams = processedTeams.sort((a,b) => {
			return a.totalMoney > b.totalMoney ? -1 : a.totalMoney < b.totalMoney ? 1 : 0
		})
		sortedTeams.forEach( (team) => {
			const sortedRoster = team.roster.sort((a, b) => (a.sort < b.sort) ? 1 : -1)
			team.roster = sortedRoster
		})

    	return processedTeams
    }

    
	
	// Get our team rosters from the Google Sheet / KVDB
	const getTeamRosters = async () => {
		
		
		let spreadsheet_id = "1c231M42E4NkKsIqpMdMGALBmW9S6GAuhdS5KWVB4F50"
		let gid = "629583302"
		
				
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
			if (obj["Team"] != null) {
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

		return teams		
	}



</script>


{#if tourneyName}
	<h1 class="tourney-name">{tourneyName}</h1>
{:else}
	<img class="sheets-icon" src="https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png" alt="Loading"><span>&nbsp;Loading current tournament</span>
{/if}
<div class="teams">
	{#if processedTeams}
		{#each processedTeams as team, i}
			<table class="team" width="100%" border="0">
				<tr>
					<td>
						<Team team={team} placeNumber={i+1} isFavorite={false}></Team>	
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
	  margin-bottom: 5px;
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
</style>