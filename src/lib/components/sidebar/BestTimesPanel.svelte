<script lang="ts">
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatDuration } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import BlockCard from './BlockCard.svelte';
	import DurationPicker from './DurationPicker.svelte';
	import Section from './Section.svelte';

	const LIMIT = 4;

	type Sort = 'best' | 'earliest' | 'longest';
	const SORTS: { value: Sort; label: string }[] = [
		{ value: 'best', label: 'Best match' },
		{ value: 'earliest', label: 'Earliest' },
		{ value: 'longest', label: 'Longest' }
	];

	let sort = $state<Sort>('best');
	/** Grid day key to show, or '' for every day. */
	let dayKey = $state('');
	let expanded = $state<Record<string, boolean>>({});

	const best = $derived(app.best);
	const days = $derived(app.grid?.days ?? []);

	const groups = $derived.by(() => {
		if (!best) return [];
		const out: { key: string; title: string; hint: string; blocks: TimeBlock[] }[] = [];
		out.push({
			key: 'everyone',
			title: best.requiredCount < best.considered ? 'Everyone can make it' : 'Everyone’s free',
			hint: '',
			blocks: best.everyone
		});
		if (best.requiredCount && best.requiredCount < best.considered) {
			out.push({
				key: 'required',
				title: 'All required people',
				hint: 'Some optional people can’t make it.',
				blocks: best.required
			});
		}
		out.push({
			key: 'near',
			title: 'One person short',
			hint: best.requiredCount ? 'Missing one required person.' : 'Missing one person.',
			blocks: best.near
		});
		// A tough poll still gets an answer: the windows that fit the most people.
		if (!best.everyone.length && !best.required.length && !best.near.length) {
			out.push({
				key: 'fewer',
				title: 'Most people',
				hint: 'Nothing fits everyone.',
				blocks: best.fewer
			});
		}
		return out.filter((g) => g.blocks.length);
	});
	const total = $derived(groups.reduce((n, g) => n + g.blocks.length, 0));

	/** Days with at least one result, for the day filter. */
	const dayOptions = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const group of groups) {
			for (const block of group.blocks) counts.set(block.day, (counts.get(block.day) ?? 0) + 1);
		}
		return [...counts]
			.sort((a, b) => a[0] - b[0])
			.map(([d, count]) => ({
				key: days[d].key,
				label: days[d].date ? `${days[d].weekday}, ${days[d].date}` : days[d].weekday,
				count
			}));
	});
	// Fall back to every day if the chosen one no longer has results.
	const activeDay = $derived(dayOptions.some((o) => o.key === dayKey) ? dayKey : '');

	const shown = $derived(
		groups
			.map((group) => {
				let blocks = activeDay
					? group.blocks.filter((b) => days[b.day].key === activeDay)
					: group.blocks;
				if (sort === 'earliest') blocks = [...blocks].sort((a, b) => a.start - b.start);
				if (sort === 'longest') {
					blocks = [...blocks].sort(
						(a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
					);
				}
				return { ...group, blocks };
			})
			.filter((group) => group.blocks.length)
	);
</script>

<Section title="Best times" count={total}>
	<div class="space-y-4 px-4 pb-5">
		<DurationPicker />

		{#if app.group}
			<div class="flex items-center gap-2 rounded-lg bg-accent-soft/60 py-1.5 pr-1.5 pl-3 text-xs">
				<span class="min-w-0 flex-1 truncate text-accent-fg">
					Times for <strong class="font-semibold">{app.group.name}</strong> only
				</span>
				<button class="btn btn-ghost btn-sm" onclick={() => app.setGroup(null)}>
					Show everyone
				</button>
			</div>
		{/if}

		{#if best && best.considered === 0}
			<p class="rounded-lg bg-subtle px-3 py-3 text-[13px] text-fg-2">
				Everyone is skipped. Mark someone as required or optional to find times.
			</p>
		{:else if best && total === 0}
			<div class="rounded-lg bg-subtle px-3 py-3 text-[13px] text-fg-2">
				<p class="font-medium text-fg">Nothing fits a {formatDuration(app.duration)} meeting</p>
				<p class="mt-1">
					{#if best.requiredCount > 0}
						Try a shorter meeting, or mark someone as optional.
					{:else}
						No one is required, so try a shorter meeting or skip someone who can’t make it.
					{/if}
				</p>
				{#if app.duration > 15}
					<button
						class="btn btn-secondary btn-sm mt-2.5"
						onclick={() => app.setDuration(Math.max(15, app.duration / 2))}
					>
						Try {formatDuration(Math.max(15, Math.round(app.duration / 2 / 15) * 15))}
					</button>
				{/if}
			</div>
		{/if}

		{#if total > 1}
			<div class="flex gap-2">
				<label class="min-w-0 flex-1">
					<span class="sr-only">Show day</span>
					<select
						class="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-fg"
						bind:value={dayKey}
					>
						<option value="">All days ({total})</option>
						{#each dayOptions as option (option.key)}
							<option value={option.key}>{option.label} ({option.count})</option>
						{/each}
					</select>
				</label>
				<label>
					<span class="sr-only">Sort by</span>
					<select
						class="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg"
						bind:value={sort}
					>
						{#each SORTS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}

		{#if total && !app.pinnedBlock}
			<p class="text-xs text-fg-3">
				{layout.showHeatmap
					? 'Click a time to see it on the grid and add it to Google Calendar.'
					: 'Tap a time to see who can make it and add it to Google Calendar.'}
			</p>
		{/if}

		{#each shown as group (group.key)}
			{@const open = expanded[group.key]}
			<div>
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<h3 class="text-xs font-semibold text-fg">
						{group.title}
						<span class="ml-1 font-normal text-fg-3 tabular">{group.blocks.length}</span>
					</h3>
					{#if group.hint}<span class="truncate text-[11px] text-fg-3">{group.hint}</span>{/if}
				</div>
				<ul class="space-y-2">
					{#each open ? group.blocks : group.blocks.slice(0, LIMIT) as block (block.id)}
						<BlockCard {block} />
					{/each}
				</ul>
				{#if group.blocks.length > LIMIT}
					<button
						class="btn btn-ghost btn-sm mt-1.5 w-full"
						onclick={() => (expanded[group.key] = !open)}
					>
						{open ? 'Show fewer' : `Show ${group.blocks.length - LIMIT} more`}
					</button>
				{/if}
			</div>
		{/each}
	</div>
</Section>
