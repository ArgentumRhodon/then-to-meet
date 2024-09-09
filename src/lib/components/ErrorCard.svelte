<script lang="ts">
	export let error;
	export let customMessage = '';
</script>

<div class="card variant-filled-error p-4">
	{#if customMessage}
		<p>{customMessage}</p>
	{:else}
		<p>{error.message}</p>
	{/if}
</div>
