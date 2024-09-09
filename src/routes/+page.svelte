<script lang="ts">
	import { NoMeetingLoaded, ErrorCard, getPeople, getSlots, people, slots, info } from '$lib';
	import PeopleList from '$lib/components/PeopleList.svelte';
	import TimeTable from '$lib/components/TimeTable.svelte';
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	let w2mLink = 'https://www.when2meet.com/?25478485-BiFSz';
	let meetingPromise: Promise<void>;
	const targetScriptNum = 9;

	const loadMeeting = async (meetingLink: string): Promise<void> => {
		const meetingIDRegex: RegExp = /\?(\d+-\w+)/g;
		let match;

		if ((match = meetingIDRegex.exec(meetingLink)) !== null) {
			try {
				const meetingID = match[0];
				const htmlRes = await fetch(`/api/w2m/${meetingID}`);
				const html = await htmlRes.text();
				// parse html response
				const parser = new DOMParser();
				const dom = parser.parseFromString(html, 'text/html');
				const scriptContent = dom.scripts[targetScriptNum].innerHTML;
				// update stores
				$slots = getSlots(scriptContent);
				$people = getPeople(scriptContent, $slots);
				// Other info about the meeting
				$info = {
					title: dom.title.split(' - ')[0]
				};
			} catch (e) {
				throw new Error(
					'Failed to load link/ID. Ensure it is correct and check your network connection.'
				);
			}
		} else {
			throw new Error('Bad link/ID.');
		}
	};

	const onLinkSubmit = (e: SubmitEvent): void => {
		e.preventDefault();
		meetingPromise = loadMeeting(w2mLink);
	};
</script>

<div class="h-full flex flex-col lg:flex-row">
	<div class="bg-surface-900 lg:w-96 min-w-96 h-min lg:h-full p-4 shadow-2xl">
		<form
			class="input-group sm:grid-cols-[auto_1fr_auto] lg:grid-cols-none"
			on:submit={onLinkSubmit}
		>
			<label for="link" class="input-group-shim p-4">When2meet Link</label>
			<input
				type="text"
				name="link"
				class="input p-4"
				placeholder="https://www.when2meet.com/..."
				bind:value={w2mLink}
			/>
			<button class="btn variant-filled-primary p-4">Load Meeting</button>
		</form>

		<hr class="my-4" />

		<div>
			{#if meetingPromise !== undefined}
				{#await meetingPromise}
					<ProgressRadial width="w-24" />
				{:then res}
					<PeopleList />
				{:catch error}
					<ErrorCard {error} />
				{/await}
			{:else}
				<NoMeetingLoaded />
			{/if}
		</div>
	</div>
	<div class="h-min flex-grow p-4 overflow-x-scroll">
		{#if meetingPromise !== undefined}
			{#await meetingPromise}
				<ProgressRadial width="w-24" />
			{:then res}
				<TimeTable />
			{:catch error}
				<ErrorCard {error} />
			{/await}
		{:else}
			<NoMeetingLoaded />
		{/if}
	</div>
</div>
