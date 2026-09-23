<script lang="ts">
	import { formatDay, formatTimeRange } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { heatColor } from '$lib/ui/heat';

	let { slot }: { slot: number } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const start = $derived(event.slots[slot].time);
	const free = $derived(new Set(event.slots[slot].available));

	const groups = $derived.by(() => {
		const available = [];
		const unavailable = [];
		const skipped = [];
		for (const person of event.people) {
			const role = app.effectiveRoleOf(person.id);
			if (role === 'skip') skipped.push(person);
			else if (free.has(person.id)) available.push({ ...person, role });
			else unavailable.push({ ...person, role });
		}
		return { available, unavailable, skipped };
	});
	const total = $derived(groups.available.length + groups.unavailable.length);
</script>

<div class="w-64 p-3">
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="text-xs text-fg-2">{formatDay(start, zone, event.weekly)}</p>
			<p class="text-sm font-semibold tabular">
				{formatTimeRange(start, start + event.slotSeconds, zone)}
			</p>
		</div>
		<p class="text-right">
			<span class="text-sm font-semibold tabular">{groups.available.length}/{total}</span>
			<span class="block text-[11px] text-fg-3">free</span>
		</p>
	</div>
	<div class="mt-2 h-1 overflow-hidden rounded-full bg-heat-0">
		<div
			class="h-full rounded-full"
			style:width="{total ? (groups.available.length / total) * 100 : 0}%"
			style:background={heatColor(groups.available.length, total)}
		></div>
	</div>

	{#each [{ label: 'Available', people: groups.available }, { label: 'Can’t make it', people: groups.unavailable }] as group (group.label)}
		{#if group.people.length}
			<p class="eyebrow mt-3 mb-1.5">{group.label}</p>
			<ul class="space-y-1">
				{#each group.people as person (person.id)}
					<li
						class="flex items-center gap-2 text-[13px] {group.label === 'Available'
							? ''
							: 'text-fg-2'}"
					>
						<Avatar id={person.id} name={person.name} size={18} />
						<span class="truncate">{person.name}</span>
						{#if person.role === 'optional'}<span class="ml-auto text-[11px] text-fg-3"
								>optional</span
							>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/each}

	{#if groups.skipped.length}
		<p class="mt-3 text-[11px] text-fg-3">
			Not counted: {groups.skipped.length > 3
				? `${groups.skipped.length} people`
				: groups.skipped.map((p) => p.name).join(', ')}
		</p>
	{/if}
</div>
