<script lang="ts">
	import selectedPeople from '$lib/stores/selectedPeople';
	import slots from '$lib/stores/slots';
	import { type MeetingData, type Meetings, type SlotData } from '$lib/types';

	const lengthRange = {
		min: 15,
		max: 15
	};

	const onMinChange = () => {
		if (lengthRange.min > lengthRange.max) {
			lengthRange.min = lengthRange.max;
		}
	};
	const onMaxChange = () => {
		if (lengthRange.max < lengthRange.min) {
			lengthRange.max = lengthRange.min;
		}
	};

	const everyoneAvailable = (slot: SlotData) => {
		return [...$selectedPeople].every((person) => slot.available.includes(person.id));
	};

	const printTimes = () => {
		const meetings: Meetings = {};
		const minSlotDiff = lengthRange.min / 15;
		let maxSlotDiff = lengthRange.max / 15;

		for (let day in $slots) {
			const daySlots = $slots[day];
			for (let i = 0; i < daySlots.length - minSlotDiff; i++) {
				// If slot not good, move on to next slot
				if (!everyoneAvailable(daySlots[i])) continue;

				// Move along continuous slots
				let lookForward = i;
				while (everyoneAvailable(daySlots[lookForward]) && lookForward < daySlots.length - 1) {
					lookForward++;
				}

				// If difference is less than min, move to next bad slot
				const difference = lookForward - i - 1;
				if (difference < minSlotDiff) {
					i = lookForward - 1;
					continue;
				}

				// Initialize new array of meetings for a given day
				if (!meetings[day]) meetings[day] = new Array<MeetingData>();

				// If length of continouous slots is less than max length, set max length to
				// length of cont slots for this round
				maxSlotDiff = Math.min(maxSlotDiff, difference);
				// Add all meetings with start of i slot with length between max and min
				for (let j = i + minSlotDiff; j <= i + maxSlotDiff; j++) {
					meetings[day].push({
						start: daySlots[i].time,
						end: daySlots[j].time,
						length: (j - i) * 15
					});
				}
			}
		}
		console.log(meetings);
	};
</script>

<h3>Print Meeting Times</h3>
<form action="" class="space-y-2">
	<div class="flex gap-2">
		<label for="">
			<span>Min Length (Minutes)</span>
			<input
				type="number"
				name="link"
				class="input p-4"
				step="15"
				min="15"
				bind:value={lengthRange.min}
				on:change={onMinChange}
			/>
		</label>
		<label for="">
			<span>Max Length (Minutes)</span>
			<input
				type="number"
				name="link"
				class="input p-4"
				step="15"
				min="15"
				bind:value={lengthRange.max}
				on:change={onMaxChange}
			/>
		</label>
	</div>
	<button class="btn variant-filled-tertiary w-full" on:click={printTimes}>Print Times</button>
</form>
