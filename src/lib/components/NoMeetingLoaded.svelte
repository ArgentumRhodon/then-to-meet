<script>
	import { linkMemory } from '$lib';
</script>

<div class="card p-4">
	<h2 class="text-lg text-warning-500">No Meeting Loaded...</h2>
	<p>
		To get started, enter the link or ID of a When2meet event in the When2meet Link field.
		{#if $linkMemory.length > 0}
			<span>Or select a previously loaded meeting.</span>
		{/if}
	</p>
</div>
