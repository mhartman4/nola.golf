<!-- ##TODO: UNCOMMENT THIS FILE!! -->

<script>
	console.log("Hello!")
 	import Picker from "./Picker.svelte"
	import Weekly from "./Weekly.svelte"
	import WeeklyEspn from "./WeeklyEspn.svelte"
	import Overall from "./Overall.svelte"
	import ConfidencePool from "./ConfidencePool/ConfidencePool.svelte"
	import MastersPool from "./MastersPool.svelte"
	import PgaPool from "./PgaPool.svelte"
	import UsOpenPool from "./UsOpenPool.svelte"
	import TheOpenPool from "./TheOpenPool.svelte"
	import PellePoolMasters from "./PellePoolMasters.svelte"
	import { onMount } from "svelte"
  	let pages = ["Weekly","Overall"]
	let currentPage = "Weekly"
	let confidencePool = window.location.href.includes("?confidence")
	let mastersPool = window.location.href.includes("?masters")
	let pgaPool = window.location.href.includes("?pga")
	let usOpenPool = window.location.href.includes("?usopen")
	let theOpenPool = window.location.href.includes("?theopen")
	let pellePoolMasters = window.location.href.includes("?pellemasters")

</script>

{#if confidencePool}
	<div id="main">
		<ConfidencePool />
	</div>
{:else if mastersPool}
	<div id="main">
		<MastersPool />
	</div>
{:else if pgaPool}
	<div id="main">
		<PgaPool />
	</div>
{:else if usOpenPool}
	<div id="main">
		<UsOpenPool />
	</div>
{:else if theOpenPool}
	<div id="main">
		<TheOpenPool />
	</div>
{:else if pellePoolMasters}
	<div id="main">
		<PellePoolMasters />
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