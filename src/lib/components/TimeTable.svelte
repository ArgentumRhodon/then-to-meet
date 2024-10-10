<script lang="ts">
	import { slots, selectedPeople, hoveredMeeting } from '$lib';
	import type { SlotData } from '$lib/types';

	const expFalloff = (input: number): number => {
		return (Math.pow(2, 2 * input) - 1) / (Math.pow(2, 2) - 1);
	};

	$: slotStyle = (slot: SlotData): string => {
		let txtColor = 'black';
		let bgColor = 'rgb(0, 255, 0)';

		const stepSize = 1 / $selectedPeople.size;

		// Represents the ratio of available people to people selected
		let ratio = 0;
		$selectedPeople.forEach((person) => {
			if (slot.available.includes(person.id)) {
				ratio += stepSize;
			}
		});

		let opacity = expFalloff(ratio); // Make perfect overlap pop with an exponental falloff

		if ($hoveredMeeting) {
			const { start, end } = $hoveredMeeting;

			if (slot.slot < start.slot || slot.slot > end.slot) {
				opacity /= 2;
			}
		}

		bgColor = `rgba(${(1 - opacity) * 255}, ${opacity * 255}, 0, ${opacity})`; // Green good, red bad

		if (opacity < 0.65) txtColor = 'rgb(185, 185, 185)'; // Ensure decent text contrast

		return `color:${txtColor};background-color:${bgColor}`;
	};
</script>

<article class="h-[calc(100vh-32px)] overflow-y-auto">
	<table class="border-collapse w-full">
		<thead class="h-8 sticky top-0">
			<tr class="bg-surface-500">
				{#each Object.keys($slots) as day}
					<th class="border border-surface-500 p-0.5 sticky top-0">{day}</th>
				{/each}
			</tr>
		</thead>
		<tbody class="text-center">
			{#each { length: Object.values($slots)[0].length } as _, rowIndex}
				<tr>
					{#each Object.keys($slots) as day}
						<td
							class="border border-surface-500 text-primary-100/50 p-0.5"
							style={slotStyle($slots[day][rowIndex])}
						>
							{$slots[day][rowIndex].time}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</article>
