<script>
  import { onMount } from "svelte"
  export let pages = []
  export let activePage
  let dvLeague = window.location.href.includes("?league=dv")

  onMount(() => {
    // Set default tab value
    activePage = pages[0]
  });
  
	const handleClick = tabValue => () => (activePage = tabValue)
</script>

<div class="picker">
	{#each pages as page}
		<span class="picker-option {activePage === page ? ' selected' : ''} {dvLeague ? ' comic' : ''}" href="#{page}" on:click={handleClick(page)}>
			{page}
		</span>
	{/each}
</div>



<style>
	.picker {
  		margin-top:  10px;
	}
	
	.picker-option {
		margin: 20px;
		color: grey;
		font-family: "Arial";
		cursor: pointer; 
		text-transform: uppercase;
		font-weight: 800;
	}

	.selected {
		color: #337ab7;
		border-bottom: 1px solid #337ab7;
		padding-bottom: 3px;
	}

	.comic {
		font-family: "Comic Sans MS", "Comic Sans","Marker Felt";
	}
</style>