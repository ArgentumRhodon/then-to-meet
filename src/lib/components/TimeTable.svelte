<script lang="ts">
	import { slots, selectedPeople } from '$lib';

	// 'available' is an array of IDs of people available in that slot
	$: availableContainsSelected = (available: number[]) => {
		if ($selectedPeople.size === 0) return false;

		return [...$selectedPeople].every((person) => available.includes(person.id));
	};
</script>

<table class="border-collapse w-full">
	<thead>
		<tr class="bg-surface-500">
			{#each Object.keys($slots) as day}
				<th class="border border-surface-700 p-0.5">{day}</th>
			{/each}
		</tr>
	</thead>
	<tbody class="text-center">
		{#each { length: Object.values($slots)[0].length } as _, rowIndex}
			<tr>
				{#each Object.keys($slots) as day}
					<td
						class="border border-surface-500 text-primary-100/50 p-0.5"
						class:bg-green-800={availableContainsSelected($slots[day][rowIndex].available)}
					>
						{$slots[day][rowIndex].time}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
