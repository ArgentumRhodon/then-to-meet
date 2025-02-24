<script lang="ts">
	import { goto } from '$app/navigation';
	import { info, linkMemory } from '$lib';

	export let loadLink: (link: string) => void;

	let selectLink = '-1';

	const loadSelect = () => {
		if (selectLink != '-1') {
			loadLink(selectLink);
			goto(`/?${encodeURIComponent(selectLink)}`);
		}
	};

	info.subscribe((value) => {
		if (!value) return;

		if (selectLink !== value.link && value.link !== '') {
			selectLink = value.link;
		}
	});
</script>

<select class="select p-4" name="linkMemory" id="" bind:value={selectLink} on:change={loadSelect}>
	<option value="-1" selected>Load Previous</option>
	{#each $linkMemory as { link, title }}
		<option value={link}>{title}</option>
	{/each}
</select>
