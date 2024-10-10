<script lang="ts">
	import { slots, meetings, selectedPeople, hoveredMeeting } from '$lib';
	import { type MeetingData, type SlotData } from '$lib/types';
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { writable } from 'svelte/store';

	export let scrollParent: HTMLDivElement;

	const lengthRange = writable({
		min: 15,
		max: 15
	});

	// Perhaps not the best practice to throw all this into a reactive declaration
	$: {
		// Defined in the reactive statement to enable updates when selectedPeople changes
		// Returns true if everyone is selected people is within a given slot's availability
		const everyoneAvailable = (slot: SlotData) => {
			if (!slot) return false;
			if (!$selectedPeople.size) return false;

			return [...$selectedPeople].every((person) => slot.available.includes(person.id));
		};

		meetings.set({});

		const minSlotDiff = $lengthRange.min / 15;
		let maxSlotDiff = $lengthRange.max / 15;

		for (let day in $slots) {
			const daySlots = $slots[day];
			for (let i = 0; i < daySlots.length - minSlotDiff; i++) {
				// If slot not good, move on to next slot
				if (!everyoneAvailable(daySlots[i])) continue;

				// Move along continuous slots
				let lookForward = i;
				while (everyoneAvailable(daySlots[lookForward + 1])) {
					lookForward++;
				}

				// If difference is less than min, move to next bad slot
				const difference = lookForward - i;
				if (difference < minSlotDiff) {
					i = lookForward;
					continue;
				}

				// Initialize new array of meetings for a given day
				if (!$meetings[day]) $meetings[day] = {};

				// Determine max difference between found and specified
				let maxDifference = Math.min(difference, maxSlotDiff);
				// Add all meetings with start of i slot with length between max and min
				for (let j = i + minSlotDiff; j <= i + maxDifference; j++) {
					const meetingLength = `${(j - i) * 15} Minutes`;
					if (!$meetings[day][meetingLength])
						$meetings[day][meetingLength] = new Array<MeetingData>();

					$meetings[day][meetingLength].push({
						start: {
							time: daySlots[i].time,
							slot: daySlots[i].slot
						},
						end: {
							time: daySlots[j].time,
							slot: daySlots[j].slot
						}
					});
				}
			}
		}
	}

	const handleTimeChange = (e: Event) => {
		const input = event?.target as HTMLInputElement;
		let inputValue: number = Number(input.value);
		inputValue = Math.round(inputValue / 15) * 15;
		if ((e.target as HTMLInputElement).name === 'min') {
			$lengthRange.min = inputValue;
		} else {
			$lengthRange.max = inputValue;
		}
		input.value = String(inputValue);
		scrollDown();
	};

	// Timeout to allow time for accordion animation...
	const scrollDown = () => {
		setTimeout(() => scrollParent.scrollTo(0, scrollParent.scrollHeight), 150);
	};
</script>

<div class="space-y-2">
	<h3>Meeting Times</h3>
	<form action="" class="space-y-2 !mt-0">
		<div class="flex gap-2">
			<label class="flex-1">
				<span>Min Length (Minutes)</span>
				<input
					type="number"
					name="min"
					class="input p-4"
					step="15"
					min="15"
					max={$lengthRange.max}
					value={$lengthRange.min}
					on:change={handleTimeChange}
				/>
			</label>
			<label class="flex-1">
				<span>Max Length (Minutes)</span>
				<input
					type="number"
					name="max"
					class="input p-4"
					step="15"
					min={$lengthRange.min}
					value={$lengthRange.max}
					on:change={handleTimeChange}
				/>
			</label>
		</div>
	</form>

	{#if $selectedPeople.size >= 2}
		<Accordion>
			{#each Object.keys($meetings) as day}
				<AccordionItem on:click={scrollDown}>
					<svelte:fragment slot="summary">
						<h4>{day}</h4>
					</svelte:fragment>
					<svelte:fragment slot="content">
						<Accordion>
							{#each Object.keys($meetings[day]) as length}
								<AccordionItem on:click={scrollDown}>
									<svelte:fragment slot="summary">
										<p>{length}</p>
									</svelte:fragment>
									<svelte:fragment slot="content">
										{#each Object.values($meetings[day][length]) as meeting}
											<p
												class="ml-6 card card-hover !m-0 p-2"
												on:mouseenter={() => ($hoveredMeeting = meeting)}
												on:mouseleave={() => ($hoveredMeeting = null)}
											>
												{meeting.start.time} - {meeting.end.time}
											</p>
										{/each}
									</svelte:fragment>
								</AccordionItem>
							{/each}
						</Accordion>
					</svelte:fragment>
				</AccordionItem>
			{/each}
		</Accordion>
		{#if Object.keys($meetings).length === 0}
			<p class="card variant-filled-error p-4">No overlap</p>
		{/if}
	{:else}
		<p class="card variant-filled-warning p-4">Select at least 2 participants</p>
	{/if}
</div>
