<script lang="ts">
	import { linkMemory } from '$lib';

	export let loadLink: (link: string) => void;

	let selectLink = '-1';

	const loadSelect = () => {
		if (selectLink != '-1') {
			loadLink(selectLink);
		}
	};
</script>

<select class="select p-4" name="linkMemory" id="" bind:value={selectLink} on:change={loadSelect}>
	<option value="-1" selected>Load Previous</option>
	{#each $linkMemory as { link, title }}
		<option value={link}>{title}</option>
	{/each}
</select>
