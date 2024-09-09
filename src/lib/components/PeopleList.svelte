<script lang="ts">
	import { info, people, selectedPeople } from '$lib';
	import type { Person } from '$lib/types';

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
</script>

<h2 class="text-lg mb-2">{$info.title}</h2>
<ul class="space-y-2">
	{#each $people as person}
		<li>
			<button
				class="btn variant-outline-surface w-full"
				class:!variant-filled-primary={$selectedPeople.has(person)}
				on:click={() => togglePerson(person)}
			>
				{person.name}
			</button>
		</li>
	{/each}
</ul>
