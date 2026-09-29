<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { roleChip } from '$lib/ui/roleChip';

	/**
	 * A button that reveals who can't make a time, with how many of the `total` that is. Names are
	 * colored by role instead of labeled; `note` adds a detail after a name.
	 */
	let {
		people,
		total
	}: { people: { name: string; role: string; note?: string }[]; total: number } = $props();

	let open = $state(false);
</script>

<div class="text-xs">
	<button
		class="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-fg-2 hover:text-fg"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		See who can’t make it
		<span class="font-normal text-fg-3 tabular">({people.length}/{total})</span>
		<ChevronDown
			class="size-3.5 text-fg-3 transition-transform {open ? 'rotate-180' : ''}"
			aria-hidden="true"
		/>
	</button>
	{#if open}
		<ul class="mt-1.5 flex flex-wrap gap-1">
			{#each people as person (person.name)}
				<li class="rounded-full px-2 py-0.5 {roleChip(person.role)}">
					{person.name}{#if person.note}<span class="text-fg-3"> · {person.note}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
