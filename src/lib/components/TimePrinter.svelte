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

	// Returns true if everyone is selected people is within a given slot's availability
	const everyoneAvailable = (slot: SlotData) => {
		if (!slot) return false;
		if (!$selectedPeople.size) return false;

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
				if (!meetings[day]) meetings[day] = new Array<MeetingData>();

				// Determine max difference between found and specified
				let maxDifference = Math.min(difference, maxSlotDiff);
				// Add all meetings with start of i slot with length between max and min
				for (let j = i + minSlotDiff; j <= i + maxDifference; j++) {
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
