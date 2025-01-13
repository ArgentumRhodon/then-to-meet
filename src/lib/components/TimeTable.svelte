<script lang="ts">
	import { slots, selectedPeople, hoveredMeeting } from '$lib';
	import type { SlotData } from '$lib/types';
	import { writable, type Writable } from 'svelte/store';

	const expFalloff = (input: number): number => {
		return (Math.pow(2, 2 * input) - 1) / (Math.pow(2, 2) - 1);
	};

	$: slotStyle = (slot: SlotData): string => {
		let txtColor = 'black';
		let bgColor = 'rgb(0, 255, 255)';

		if ($hoveredMeeting) {
			const { start, end } = $hoveredMeeting;

			console.log($hoveredMeeting, slot);

			if (slot.slot >= start.slot && slot.slot <= end.slot) {
				return `color:${txtColor};background-color:${bgColor}`;
			}
		}

		const stepSize = 1 / $selectedPeople.size;

		// Represents the ratio of available people to people selected
		let ratio = 0;
		$selectedPeople.forEach((person) => {
			if (slot.available.includes(person.id)) {
				ratio += stepSize;
			}
		});

		const opacity = expFalloff(ratio); // Make perfect overlap pop with an exponental falloff
		bgColor = `rgba(${(1 - opacity) * 255}, ${opacity * 255}, 0, ${opacity})`; // Green good, red bad

		if (opacity < 0.65) txtColor = 'rgb(185, 185, 185)'; // Ensure decent text contrast

		return `color:${txtColor};background-color:${bgColor}`;
	};

	const onSlotHover = (slot: SlotData, day: string) => {
		availablePeople = [];
		unavailablePeople = [];

		date = `${day} @ ${slot.time}`;

		$selectedPeople.forEach((person) => {
			if (slot.available.includes(person.id)) {
				availablePeople.push(person.name);
			} else {
				unavailablePeople.push(person.name);
			}
		});
	};

	let date: string = 'Hover or tap a time slot to see availability';
	let availablePeople: string[] = [];
	let unavailablePeople: string[] = [];
</script>

<div class="lg:hidden gap-4 sticky top-0 p-4 card w-full">
	<h2 class="text-center mb-4">{date}</h2>
	<div class="flex justify-around">
		<div>
			<span class="text-xl font-bold underline">Available</span>
			<ul>
				{#each availablePeople as person}
					<li><span>{person}</span></li>
				{/each}
			</ul>
		</div>
		<div>
			<span class="text-xl font-bold underline">Unavailable</span>
			<ul>
				{#each unavailablePeople as person}
					<li><span>{person}</span></li>
				{/each}
			</ul>
		</div>
	</div>
</div>
<article class="h-[calc(100vh-32px)] overflow-y-auto flex">
	<div class="hidden lg:flex flex-col gap-4 sticky top-0 p-4 card w-64">
		<h2>{date}</h2>
		<div>
			<span class="text-xl font-bold underline">Available</span>
			<ul>
				{#each availablePeople as person}
					<li><span>{person}</span></li>
				{/each}
			</ul>
		</div>
		<div>
			<span class="text-xl font-bold underline">Unavailable</span>
			<ul>
				{#each unavailablePeople as person}
					<li><span>{person}</span></li>
				{/each}
			</ul>
		</div>
	</div>
	<table class="border-collapse w-full">
		<thead class="h-8 sticky top-0">
			<tr class="bg-surface-500">
				{#each Object.keys($slots) as day}
					<th class="border border-surface-500 p-0.5 sticky top-0">{day}</th>
				{/each}
			</tr>
		</thead>
		<tbody class="text-center h-full">
			{#each { length: Object.values($slots)[0].length } as _, rowIndex}
				<tr>
					{#each Object.keys($slots) as day}
						<td
							class="border border-surface-500 text-primary-100/50 p-0.5 hover:shadow-[inset_0px_0px_0px_2px_#ff0000]"
							style={slotStyle($slots[day][rowIndex])}
							on:mouseenter={() => onSlotHover($slots[day][rowIndex], day)}
							on:click={() => onSlotHover($slots[day][rowIndex], day)}
						>
							{$slots[day][rowIndex].time}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</article>
