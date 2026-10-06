<script lang="ts">
	import { formatList } from '$lib/analysis/format';
	import Avatar from '$lib/ui/Avatar.svelte';

	/** Who can make a time, as a row of avatars big enough to read; hover for the full name. */
	let { people, limit = 10 }: { people: { id: number; name: string }[]; limit?: number } = $props();
</script>

<!-- The names are only in hover titles on screen, so the label carries them for screen readers. -->
<div
	class="flex items-center gap-1.5"
	role="img"
	aria-label="{people.length} can make it: {formatList(people.map((p) => p.name))}"
>
	<span class="flex -space-x-1">
		{#each people.slice(0, limit) as person (person.id)}
			<span title={person.name}>
				<Avatar id={person.id} name={person.name} size={26} class="ring-2 ring-surface" />
			</span>
		{/each}
	</span>
	{#if people.length > limit}
		<span class="text-xs text-fg-3 tabular">+{people.length - limit}</span>
	{/if}
</div>
