<script>
  	import { onMount } from "svelte"
	import Team from "./Team.svelte"
	import moment from "moment"
	import ResultsTable from "./ResultsTable.svelte"
	let teams, tourneyName, leaderboard, favoriteTeam, blurb
	let resultsPlayers = []
	export let nate = window.location.search.indexOf("nate") != -1
	let trueUrl = window.location.href.replace("?league=dv", "")
	let rawResults = window.location.href.includes("results")
	let error
	// onMount do all of our async functions
	onMount(async () => {

		try {
			const tournaments = await getRelevantTournament()
			const rawTeams = await getTeamRosters()
			
			// if (tournaments[0].id == "018") {
			// 	processTeamTournament(tournaments[0])
			// }
			// else {
				// 
			// }
			
			const firstTourneyTeams = processFirstTourney(rawTeams, await getPgaStandings(tournaments[0]))	
			
			// If there's more than 1 tournament then we need to process the 2nd one also
			if (tournaments.length > 1) {
				const secondTourneyTeams = await processSecondTourney(tournaments[1], firstTourneyTeams)
				teams = await sortTeams(secondTourneyTeams)
			}
			else {
				teams = sortTeams(firstTourneyTeams)
			}
		}
		catch (e) {
			error = e
		}
		
	})


	// Hit the google sheet for the schedule
	const getRelevantTournament = async () => {
				
		// const endpoint = `https://docs.google.com/spreadsheets/d/1lNeLG3zTCsDr7KvKJNky1maiUNVoEqapj-LCt8G9Z7Q/gviz/tq?tqx=out:json&tq&gid=61191989`
		const endpoint = `https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/schedule` + "?timestamp=" + Date.now()
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
						"totalPurse": t.c[3].v / 0.18,
						"payouts": payoutPercentages.map((n) => n * (t.c[3].v / 0.18))
					}
				)
			}
		})
		tourneyName = tournaments.map((t) => t.name).join(" / ")

		return tournaments;
	}

    // Once we have the PGA Standings, process our first Tournament
	const processFirstTourney = (rawTeams, pgaStanding) => {
		
		rawTeams.forEach((team) => {
				team.processed = true
				team.totalMoney = 0.0
				team.roster.forEach((player) => {
					const pgaPlayerMatches = pgaStanding.filter(p => p.playerId === player.id)
					if (pgaPlayerMatches.length > 0) {
						player.isPlaying = true
						const pgaPlayer = pgaPlayerMatches[0]
						player.name = pgaPlayer.playerNames.firstName + ' ' + pgaPlayer.playerNames.lastName,
						player.positionNum = parseInt(pgaPlayer.positionCurrent.replace(/\D/g,'')),
						player.position = pgaPlayer.positionCurrent,
						player.projMoney = pgaPlayer.projected_money_event,
						player.today = pgaPlayer.round,
						player.thru = pgaPlayer.thru,
						player.total = pgaPlayer.total,
						player.playerId = pgaPlayer.playerId,
						player.pgaStatus = pgaPlayer.status,
						team.totalMoney += pgaPlayer.projected_money_event,
						player.secondTourney = false,
						player.firstRoundTeeTime = moment(pgaPlayer.tee_time).format("h:mm a")
					}
				})
		})
		rawTeams.forEach((team) => {
			team.roster.forEach((player) => {
				if (player.isPlaying === undefined) {
					player.isPlaying = false
					// If not playing put at bottom of list
					player.sort = -2
				}
				else {
					if (isNaN(player.positionNum)) {
						// Next up is cut players
						player.sort = -1
					}
					else {
						// Then sort by projected money
						player.sort = parseInt(player.projMoney)
					}
				}
			})
		})
		return rawTeams
	}

    const processSecondTourney = async (tourneyId, firstTourneyTeams) => {
    	const standings = await getPgaStandings(tourneyId)
    	await firstTourneyTeams.forEach((team) => {
    		team.roster.forEach((player) => {
    			const pgaPlayerMatches = standings.filter(p => p.playerId === player.id)
    			if (pgaPlayerMatches.length > 0) {
						player.isPlaying = true
						const pgaPlayer = pgaPlayerMatches[0]
						player.name = pgaPlayer.playerNames.firstName + ' ' + pgaPlayer.playerNames.lastName,
						player.positionNum = parseInt(pgaPlayer.positionCurrent.replace(/\D/g,'')),
						player.position = pgaPlayer.positionCurrent,
						player.projMoney = pgaPlayer.projected_money_event,
						player.today = pgaPlayer.round,
						player.thru = pgaPlayer.thru,
						player.total = pgaPlayer.total,
						player.playerId = pgaPlayer.playerId,
						player.pgaStatus = pgaPlayer.status,
						team.totalMoney += pgaPlayer.projected_money_event,
						player.secondTourney = true,
						player.firstRoundTeeTime = moment(pgaPlayer.tee_time).format("h:mm a")
					}
    		})
    	})
    	await firstTourneyTeams.forEach((team) => {
			team.roster.forEach((player) => {
				if (player.isPlaying === undefined) {
					player.isPlaying = false
					// If not playing put at bottom of list
					player.sort = -2
				}
				else {
					if (isNaN(player.positionNum)) {
						// Next up is cut players
						player.sort = -1
					}
					else {
						// Then sort by projected money
						player.sort = parseInt(player.projMoney)
					}
				}
			})
		})
    	return firstTourneyTeams    	
    }

    // Sort by total money for standings
    const sortTeams  = (rawTeams) => {
    	const sortedTeams = rawTeams.sort((a,b) => {
			return a.totalMoney > b.totalMoney ? -1 : a.totalMoney < b.totalMoney ? 1 : 0
		})
		sortedTeams.forEach( (team) => {
			const sortedRoster = team.roster.sort((a, b) => (a.sort < b.sort) ? 1 : -1)
			team.roster = sortedRoster
		})
		return rawTeams
    }
	
	const getPgaStandings = async (tournament) => {
			// Hit KVDB to get our security blurb so we can call the PGA method
			const response = await fetch(`https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/pgasecurityblurb?timestamp=` + Date.now())
			const securityBlurb = await response.text()
			blurb = await securityBlurb
			return makePgaCall(securityBlurb, tournament)
	}
	
	const makePgaCall = async (securityBlurb, tournament) => {
			if (tournament.id != "018")
			{
				const pgaResp = await fetch("https://lbdata.pgatour.com/2022/r/" + tournament.id + "/leaderboard.json" + securityBlurb + "&timestamp=" + Date.now());
				var jsonResp = await pgaResp.json()
				leaderboard = await jsonResp.rows
			}
			else {
				leaderboard = await makePgaCallTeamTourney(securityBlurb,tournament)
				console.log(leaderboard)
			}
			var numberPlayersEachPlace = {"1": [0, 0],"2": [0, 0],"3": [0, 0],"4": [0, 0],"5": [0, 0],"6": [0, 0],"7": [0, 0],"8": [0, 0],"9": [0, 0],"10": [0, 0],"11": [0, 0],"12": [0, 0],"13": [0, 0],"14": [0, 0],"15": [0, 0],"16": [0, 0],"17": [0, 0],"18": [0, 0],"19": [0, 0],"20": [0, 0],"21": [0, 0],"22": [0, 0],"23": [0, 0],"24": [0, 0],"25": [0, 0],"26": [0, 0],"27": [0, 0],"28": [0, 0],"29": [0, 0],"30": [0, 0],"31": [0, 0],"32": [0, 0],"33": [0, 0],"34": [0, 0],"35": [0, 0],"36": [0, 0],"37": [0, 0],"38": [0, 0],"39": [0, 0],"40": [0, 0],"41": [0, 0],"42": [0, 0],"43": [0, 0],"44": [0, 0],"45": [0, 0],"46": [0, 0],"47": [0, 0],"48": [0, 0],"49": [0, 0],"50": [0, 0],"51": [0, 0],"52": [0, 0],"53": [0, 0],"54": [0, 0],"55": [0, 0],"56": [0, 0],"57": [0, 0],"58": [0, 0],"59": [0, 0],"60": [0, 0],"61": [0, 0],"62": [0, 0],"63": [0, 0],"64": [0, 0],"65": [0, 0],"66": [0, 0],"67": [0, 0],"68": [0, 0],"69": [0, 0],"70": [0, 0],"71": [0, 0],"72": [0, 0],"73": [0, 0],"74": [0, 0],"75": [0, 0],"76": [0, 0],"77": [0, 0],"78": [0, 0],"79": [0, 0],"80": [0, 0],"81": [0, 0],"82": [0, 0],"83": [0, 0],"84": [0, 0],"85": [0, 0],"86": [0, 0],"87": [0, 0],"88": [0, 0],"89": [0, 0],"90": [0, 0],"91": [0, 0],"92": [0, 0],"93": [0, 0],"94": [0, 0],"95": [0, 0],"96": [0, 0],"97": [0, 0],"98": [0, 0],"99": [0, 0],"100": [0, 0],"101": [0, 0],"102": [0, 0],"103": [0, 0],"104": [0, 0],"105": [0, 0],"106": [0, 0],"107": [0, 0],"108": [0, 0],"109": [0, 0],"110": [0, 0],"111": [0, 0],"112": [0, 0],"113": [0, 0],"114": [0, 0],"115": [0, 0],"116": [0, 0],"117": [0, 0],"118": [0, 0],"119": [0, 0],"120": [0, 0],"121": [0, 0],"122": [0, 0],"123": [0, 0],"124": [0, 0],"125": [0, 0],"126": [0, 0],"127": [0, 0],"128": [0, 0],"129": [0, 0],"130": [0, 0],"131": [0, 0],"132": [0, 0],"133": [0, 0],"134": [0, 0],"135": [0, 0],"136": [0, 0],"137": [0, 0],"138": [0, 0],"139": [0, 0],"140": [0, 0],"141": [0, 0],"142": [0, 0],"143": [0, 0],"144": [0, 0],"145": [0, 0],"146": [0, 0],"147": [0, 0],"148": [0, 0],"149": [0, 0],"150": [0, 0],"151": [0, 0],"152": [0, 0],"153": [0, 0],"154": [0, 0],"155": [0, 0],"156": [0, 0],"157": [0, 0],"158": [0, 0],"159": [0, 0],"160": [0, 0],"161": [0, 0],"162": [0, 0],"163": [0, 0],"164": [0, 0],"165": [0, 0],"166": [0, 0],"167": [0, 0],"168": [0, 0],"169": [0, 0],"170": [0, 0],"171": [0, 0],"172": [0, 0],"173": [0, 0],"174": [0, 0],"175": [0, 0],"176": [0, 0],"177": [0, 0],"178": [0, 0],"179": [0, 0],"180": [0, 0],"181": [0, 0],"182": [0, 0],"183": [0, 0],"184": [0, 0],"185": [0, 0],"186": [0, 0],"187": [0, 0],"188": [0, 0],"189": [0, 0],"190": [0, 0],"191": [0, 0],"192": [0, 0],"193": [0, 0],"194": [0, 0],"195": [0, 0],"196": [0, 0],"197": [0, 0],"198": [0, 0],"199": [0, 0],"200": [0, 0]}
			

			await leaderboard.forEach((player) => {
				var positionNum = parseInt(player.positionCurrent.replace(/\D/g,''))
				if (!isNaN(positionNum) && positionNum > 0) {
					numberPlayersEachPlace[positionNum + ""][0] += 1
				}
			})


			await tournament.payouts.forEach((p,i)=> {
				if (i > 0) {
					var numPlayersTiedAtPosition = 	numberPlayersEachPlace[i + ""][0] 
					var totalPayout = 0
					if (numPlayersTiedAtPosition > 1) {
						// Add the money from the people who are tied...
						for (let step = i; step < (i + numPlayersTiedAtPosition); step++) {
  							totalPayout += tournament.payouts[step] ? tournament.payouts[step] : 0
						}
					}
					else {
						totalPayout = tournament.payouts[i]
					}
					numberPlayersEachPlace[i + ""][1] = 1.0 * totalPayout / numPlayersTiedAtPosition
				}
			})

			await leaderboard.forEach((player) => {
					// Do the math manually. Get the positionNum and then payouts[n-1] = payout 
					var positionNum = parseInt(player.positionCurrent.replace(/\D/g,''))
					var numGolfersToSplit = numberPlayersEachPlace[positionNum + ""]
					// if there's a payout (above 65) else 0
					player.projected_money_event = numberPlayersEachPlace[positionNum] ? numberPlayersEachPlace[positionNum][1] : 0

			})
			// await console.log(numberPlayersEachPlace)
			return leaderboard
	}

	const makePgaCallTeamTourney  = async (securityBlurb, tournament) => {
		const pgaResp = await fetch("https://statdata.pgatour.com/r/" + tournament.id + "/teamleaderboard-v2.json" + securityBlurb + "&timestamp=" + Date.now());
		var jsonResp = await pgaResp.json()
		leaderboard = await jsonResp.leaderboard
		var processedResponse = []
		leaderboard.teams.forEach((t)=> {
			t.teamPlayers.forEach((p => {
				p.isActive = true
				p.status = "active"
				p.playerId = p.pid
				p.positionCurrent = t.current_position
				p.total = t.total
				p.thru = t.thru
				p.round = t.today

				if (p.firstName + " " + p.lastName == t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName) {
					p.playerNames = {
						"firstName": "🏌️‍♂️" + t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName + " / ",
						"lastName": t.teamPlayers[1].firstName + " " + t.teamPlayers[1].lastName
					}	
				}
				else {
					p.playerNames = {
						"firstName": t.teamPlayers[0].firstName + " " + t.teamPlayers[0].lastName + " / ",
						"lastName": "🏌️‍♂️" + t.teamPlayers[1].firstName + " " + t.teamPlayers[1].lastName
					}		
				}
				
				processedResponse.push(p)
			}))
		})
		// console.log(processedResponse)
		return processedResponse
	}
	
	// Get our team rosters from the Google Sheet / KVDB
	const getTeamRosters = async () => {
		
		
		let spreadsheet_id = "1YsZn_ovmbxOE8gUlmAT7z_nUv5mg9qRdwnNAX-lIrnI"
		let gid = "629583302"
		
		// if (nate) {
		// 	spreadsheet_id = "1Ur-zgH5O5iwTJ3J5pUXT-hu1irNo9W5NfJwWa5RxiW0"
		// }
		
		// let endpoint = `https://docs.google.com/spreadsheets/d/`+ spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid
		let endpoint = "https://kvdb.io/vRrcDLPTr4WWpVTJxim1H/rosters" + "?timestamp=" + Date.now()
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
						"name": player.Golfers
					})
				}
			})
			teams.push(obj)
		})

		return teams		
	}

</script>


{#if rawResults}
	{#if tourneyName}
		<h1>{tourneyName}</h1>
	{/if}
	<ResultsTable players={resultsPlayers}/>
	
{:else}

{#if tourneyName}
	<h1 class="tourney-name">{tourneyName}</h1>
{:else}
	<img class="sheets-icon" src="https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png" alt="Loading"><span>&nbsp;Loading current tournament</span>
{/if}

<div class="teams">
	{#if teams}
		{#each teams as team, i}
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
			<br>
			<code>Scraping Blurb: {blurb}</code>
		</div>
	{:else}
		<img class="sheets-icon" src="https://upload.wikimedia.org/wikipedia/en/thumb/7/77/PGA_Tour_logo.svg/233px-PGA_Tour_logo.svg.png" alt="Loading"><span>&nbsp;Scraping the PGA</span>
	{/if}
</div>

{/if}


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