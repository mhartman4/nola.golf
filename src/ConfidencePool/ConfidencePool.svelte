<script>
	import { onMount } from "svelte"
	import Pick from "./Pick.svelte"
	import Entry from "./Entry.svelte"
	let cavs = window.location.href.includes("?confidence=cle")
	let pels = window.location.href.includes("?confidence=pels")
	let franchise = cavs ? "The Cavs" : "The 'Cans"
	let spreadsheet_id = pels ? "1ciYHM-Aan8auuuep--A90OaGKEAaMnkoqrH4ccXppRI" : "1N2tavjuLDneq5F9wpYvBMamWxJLKVUXV1Nv1__hKc5M"

	let picks,standings

	
	
	

	onMount(async () => {
		picks = await getPicks()
		standings = await getStandings()
		await standings.forEach((entry)=> {
			picks.forEach((pick) => {
				if (pick["Entry"] == entry["Entry"])
				{
					entry["Picks"].push(pick)
				}
			})
		})
		
	})
	const getPicks = async () => {
		
		// Pels' / Cavs picks gid
		let gid = pels ? "1752659247" : "1752659247"
		
		
		let endpoint = `https://docs.google.com/spreadsheets/d/`+ spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid


		const response = await fetch(endpoint)
		const text = await response.text()
		const data = await JSON.parse(text.substring(47).slice(0, -2)).table
		
		const cols = data.cols.map((col) => col.label)
		// Grab all the picks
		const picks = []
		data.rows.forEach((row) => {
			const obj = {}
			cols.forEach((col, i) => {
				obj[col] = row.c[i] == null ? null : row.c[i].v
			})
			if (obj["Entry"] != null && obj["Wager"] != null) {
				picks.push(obj)	
			}
		})
		return picks
	}
	const getStandings = async () => {
		
		// Pels' standings gid
		let gid = pels ? "1314441307" : "1314441307"
		
		let endpoint = `https://docs.google.com/spreadsheets/d/`+ spreadsheet_id + `/gviz/tq?tqx=out:json&tq&gid=` + gid


		const response = await fetch(endpoint)
		const text = await response.text()
		const data = await JSON.parse(text.substring(47).slice(0, -2)).table
		
		const cols = data.cols.map((col) => col.label)
		// Grab all the picks
		const standings = []
		data.rows.forEach((row) => {
			const obj = {}
			cols.forEach((col, i) => {
				obj[col] = row.c[i] == null ? null : row.c[i].v
			})
			obj["Picks"] = []
			if (obj["Entry"] != null) {
				standings.push(obj)	
			}
		})
		return standings
	}
</script>

<a href="/public/?confidence={pels ? 'cle' : 'pels'}">
	<h1>{franchise} Confidence Pool</h1>
</a>
<!-- <code>{JSON.stringify(standings)}</code> -->
{#if standings && picks}
	{#each standings as entry, i}
		<table class="team" width="100%" border="0">
			<tr>
				<td>
					<Entry entry={entry['Entry']} placenumber={i+1} pointswon={entry['Points Won']} pointsremaining={entry['Points Remaining']} picks={entry['Picks']} />
				</td>
			</tr>
		</table>
	{/each}
	
{/if}

<style>
	h1 {
		font-size: 18px;
	    text-align: center;
	    text-transform: uppercase;
	    margin-bottom: 5px;
	    font-weight: normal;	
	}
	a {
		color: black;
		text-decoration: none;
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