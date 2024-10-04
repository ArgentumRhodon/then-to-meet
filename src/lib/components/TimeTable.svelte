<script lang="ts">
	import { slots, selectedPeople } from '$lib';

	// 'available' is an array of IDs of people available in that slot
	$: availableContainsSelected = (available: number[]) => {
		if ($selectedPeople.size === 0) return false;

		return [...$selectedPeople].some((person) => available.includes(person.id));
	};

	$: slotStyle = (available: number[]): string => {
		if ($selectedPeople.size === 0) return 'rgba(0,0,0,0)';

		const opacityStepSize = 1 / $selectedPeople.size;
		let opacity = 0;
		$selectedPeople.forEach((person) => {
			if (available.includes(person.id)) {
				opacity += opacityStepSize;
			}
		});
		const bgColor = `rgba(0, 255, 0, ${opacity})`;

		let textColor = 'black';
		if (opacity < 0.375) textColor = 'white';
		if (opacity === 0) textColor = '';

		return `color:${textColor};background-color:${bgColor}`;
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
							style={slotStyle($slots[day][rowIndex].available)}
						>
							{$slots[day][rowIndex].time}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</article>
