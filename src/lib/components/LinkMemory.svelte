<script lang="ts">
	import { goto } from '$app/navigation';
	import { linkMemory } from '$lib';
	import { info } from '$lib';

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

		if (selectLink !== value.meetingID && value.meetingID !== '') {
			selectLink = value.meetingID;
		}
	});
</script>

<select class="select p-4" name="linkMemory" id="" bind:value={selectLink} on:change={loadSelect}>
	<option value="-1" selected>Load Previous</option>
	{#each $linkMemory as { meetingID, title }}
		<option value={meetingID}>{title}</option>
	{/each}
</select>
