<script lang="ts">
	import { info, people, selectedPeople } from '$lib';
	import type { Person } from '$lib/types';
	import { onMount } from 'svelte';
	import TimePrinter from './TimePrinter.svelte';

	const togglePerson = (person: Person): void => {
		selectedPeople.update((people) => {
			const newPeople = new Set(people);
			if (people.has(person)) {
				newPeople.delete(person);
			} else {
				newPeople.add(person);
			}
			return newPeople;
		});
	};

	onMount(() => {
		$selectedPeople = new Set($people);
	});

	const toggleAll = () => {
		if ($people.every((person) => $selectedPeople.has(person))) {
			$selectedPeople = new Set();
		} else {
			$selectedPeople = new Set($people);
		}
	};
</script>

<div class="space-y-2">
	<div class="flex justify-between items-center">
		<h2 class="text-lg">{$info.title}</h2>
	</div>

	<h3>Select Participants</h3>
	<button class="btn variant-filled-surface w-full" on:click={toggleAll}>Toggle All</button>
	<ul class="space-y-2">
		{#each $people as person}
			<li>
				<button
					class="btn variant-outline-secondary w-full"
					class:!variant-filled-secondary={$selectedPeople.has(person)}
					on:click={() => togglePerson(person)}
				>
					{person.name}
				</button>
			</li>
		{/each}
	</ul>
</div>
