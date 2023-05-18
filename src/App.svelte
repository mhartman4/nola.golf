<!-- ##TODO: UNCOMMENT THIS FILE!! -->

<script>
 	import Picker from "./Picker.svelte"
	import Weekly from "./Weekly.svelte"
	import WeeklyEspn from "./WeeklyEspn.svelte"
	import Overall from "./Overall.svelte"
	import ConfidencePool from "./ConfidencePool/ConfidencePool.svelte"
	import Nba from "./NBA/Nba.svelte"
	import MastersPool from "./MastersPool.svelte"
	import PgaPool from "./PgaPool.svelte"
	import { onMount } from "svelte"
  	let pages = ["Weekly","Overall"]
	let currentPage = "Weekly"
	let confidencePool = window.location.href.includes("?confidence")
	let nbaPage = window.location.href.includes("?nba")
	let mastersPool = window.location.href.includes("?masters")
	let pgaPool = window.location.href.includes("?pga")
</script>

{#if confidencePool}
	<div id="main">
		<ConfidencePool />
	</div>
{:else if nbaPage}
	<div id="main">
		<Nba />
	</div>
{:else if mastersPool}
	<div id="main">
		<MastersPool />
	</div>
{:else if pgaPool}
	<div id="main">
		<PgaPool />
	</div>
{:else}
	<div id="main">
		<Picker bind:activePage={currentPage} pages={pages} />
		<br><br>
		
		{#if currentPage === "Weekly"}
			<!-- <Weekly /> -->
			<WeeklyEspn />
		{:else if currentPage === "Overall"}
			<Overall />
		{/if}	
	</div>	
{/if}

<style>
	#main {
		max-width: 800px;
		margin: 0 auto;
	}	
	.dv {
		background-color: rgb(0 128 0 / 17%);
		font-family: "Comic Sans MS", "Comic Sans","Marker Felt";
	}
	h3 {
		padding: 4px;
		font-size: 25px;
		font-family: "Comic Sans MS", "Comic Sans","Marker Felt";
	}
</style>