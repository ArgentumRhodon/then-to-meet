<script lang="ts">
	import {
		NoMeetingLoaded,
		ErrorCard,
		getPeople,
		getSlots,
		people,
		slots,
		info,
		linkMemory,
		resetMeetingStores,
		LinkMemory,
		LinkForm,
		TimePrinter
	} from '$lib';
	import PeopleList from '$lib/components/PeopleList.svelte';
	import TimeTable from '$lib/components/TimeTable.svelte';
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	let meetingPromise: Promise<void>;
	const targetScriptNum = 9;

	const loadMeeting = async (link: string): Promise<void> => {
		const meetingIDRegex: RegExp = /\?(\d+-\w+)/g;
		let match;

		if ((match = meetingIDRegex.exec(link)) !== null) {
			try {
				// Reset meeting stores
				resetMeetingStores();

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
					title: dom.title.split(' - ')[0],
					link
				};
				// If link hasn't been recorded, record it
				linkMemory.update((arr) => {
					if (arr.some((e) => e.title === $info.title)) {
						return arr;
					}

					return [...arr, $info];
				});
			} catch (e) {
				throw new Error(
					'Failed to load link/ID. Ensure it is correct and check your network connection.'
				);
			}
		} else {
			throw new Error('Bad link/ID. ');
		}
	};

	const loadLink = (link: string): void => {
		meetingPromise = loadMeeting(link);
	};

	let scrollParent;
</script>

<div class="h-full lg:h-screen flex flex-col lg:flex-row">
	<div
		class="scroll-smooth bg-surface-900 lg:w-72 min-w-[20rem] h-min lg:h-full p-4 shadow-2xl space-y-4 lg:overflow-y-scroll"
		bind:this={scrollParent}
	>
		<h1 class="text-2xl font-bold">ThenToMeet</h1>

		<hr />

		<LinkForm {loadLink} />

		{#if $linkMemory.length > 0}
			<LinkMemory {loadLink} />
		{/if}

		<div>
			{#if meetingPromise !== undefined}
				{#await meetingPromise}
					<ProgressRadial width="w-24" />
				{:then res}
					<div class="space-y-4">
						<PeopleList />
						<TimePrinter {scrollParent} />
					</div>
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
			{#await meetingPromise then res}
				<TimeTable />
			{/await}
		{/if}
	</div>
</div>
