<script lang="ts">
	import { slots, meetings, selectedPeople } from '$lib';
	import { type MeetingData, type SlotData } from '$lib/types';
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { writable } from 'svelte/store';

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
						start: daySlots[i].time,
						end: daySlots[j].time
					});
				}
			}
		}
	}
</script>

<h3>Meeting Times</h3>
<form action="" class="space-y-2">
	<div class="flex gap-2">
		<label class="flex-1">
			<span>Min Length (Minutes)</span>
			<input
				type="number"
				name="link"
				class="input p-4"
				step="15"
				min="15"
				max={$lengthRange.max}
				bind:value={$lengthRange.min}
			/>
		</label>
		<label class="flex-1">
			<span>Max Length (Minutes)</span>
			<input
				type="number"
				name="link"
				class="input p-4"
				step="15"
				min={$lengthRange.min}
				bind:value={$lengthRange.max}
			/>
		</label>
	</div>
</form>

<Accordion>
	{#each Object.keys($meetings) as day}
		<AccordionItem>
			<svelte:fragment slot="summary">
				<h4>{day}</h4>
			</svelte:fragment>
			<svelte:fragment slot="content">
				<Accordion>
					{#each Object.keys($meetings[day]) as length}
						<AccordionItem>
							<svelte:fragment slot="summary">
								<p>{length}</p>
							</svelte:fragment>
							<svelte:fragment slot="content">
								{#each Object.values($meetings[day][length]) as meeting}
									<p class="ml-6">{meeting.start} - {meeting.end}</p>
								{/each}
							</svelte:fragment>
						</AccordionItem>
					{/each}
				</Accordion>
			</svelte:fragment>
		</AccordionItem>
	{/each}
</Accordion>
