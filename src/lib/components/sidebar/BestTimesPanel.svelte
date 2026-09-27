<script lang="ts">
	import { blockers, type TimeBlock } from '$lib/analysis/bestTimes';
	import { MIN_DURATION } from '$lib/analysis/duration';
	import { formatDuration } from '$lib/analysis/format';
	import type { MeetingSet, MeetingsPerWeek } from '$lib/analysis/meetingSets';
	import { app } from '$lib/state/app.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import PickedTime from '../main/PickedTime.svelte';
	import BlockCard from './BlockCard.svelte';
	import DurationPicker from './DurationPicker.svelte';
	import Section from './Section.svelte';
	import SetCard from './SetCard.svelte';

	const LIMIT = 4;

	type Sort = 'best' | 'earliest' | 'longest';
	const SORTS: { value: Sort; label: string }[] = [
		{ value: 'best', label: 'Best match' },
		{ value: 'earliest', label: 'Earliest' },
		{ value: 'longest', label: 'Longest' }
	];

	const PER_WEEK: { value: MeetingsPerWeek; label: string; phrase: string }[] = [
		{ value: 1, label: 'Once', phrase: 'once a week' },
		{ value: 2, label: 'Twice', phrase: 'twice a week' },
		{ value: 3, label: '3 times', phrase: 'three times a week' }
	];

	let sort = $state<Sort>('best');
	/** Grid day key to show, or '' for every day. */
	let dayKey = $state('');
	let expanded = $state<Record<string, boolean>>({});

	const days = $derived(app.grid?.days ?? []);
	/** Meeting two or three times a week lists sets of times instead of single ones. */
	const sets = $derived(app.meetingSets);
	const results = $derived(sets ?? app.best);
	const phrase = $derived(PER_WEEK.find((p) => p.value === app.perWeek)!.phrase);

	interface Group {
		key: string;
		title: string;
		hint: string;
		items: (TimeBlock | MeetingSet)[];
	}

	const groups = $derived.by(() => {
		if (!results) return [];
		const every = sets ? ', every time' : '';
		const out: Group[] = [];
		out.push({
			key: 'everyone',
			title:
				results.requiredCount < results.considered
					? `Everyone can make it${every}`
					: `Everyone’s free${every}`,
			hint: '',
			items: results.everyone
		});
		if (results.requiredCount && results.requiredCount < results.considered) {
			out.push({
				key: 'required',
				title: `All required people${every}`,
				hint: sets ? 'Some optional people miss one.' : 'Some optional people can’t make it.',
				items: results.required
			});
		}
		const who = results.requiredCount ? 'one required person' : 'one person';
		out.push({
			key: 'near',
			title: 'One person short',
			hint: sets ? `Only ${who} misses any.` : `Missing ${who}.`,
			items: results.near
		});
		// A tough poll still gets an answer: the options that fit the most people.
		if (!results.everyone.length && !results.required.length && !results.near.length) {
			out.push({
				key: 'fewer',
				title: 'Most people',
				hint: 'Nothing fits everyone.',
				items: results.fewer
			});
		}
		return out.filter((g) => g.items.length);
	});
	const total = $derived(groups.reduce((n, g) => n + g.items.length, 0));

	/** Days with at least one result, for the day filter (single meetings only). */
	const dayOptions = $derived.by(() => {
		if (sets) return [];
		const counts = new Map<number, number>();
		for (const group of groups) {
			for (const block of group.items as TimeBlock[]) {
				counts.set(block.day, (counts.get(block.day) ?? 0) + 1);
			}
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
				if (sets) return group;
				let blocks = group.items as TimeBlock[];
				if (activeDay) blocks = blocks.filter((b) => days[b.day].key === activeDay);
				if (sort === 'earliest') blocks = [...blocks].sort((a, b) => a.start - b.start);
				if (sort === 'longest') {
					blocks = [...blocks].sort(
						(a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
					);
				}
				return { ...group, items: blocks };
			})
			.filter((group) => group.items.length)
	);

	const names = $derived(new Map((app.event?.people ?? []).map((p) => [p.id, p.name])));
	/** With no one required, a near miss is one optional person short; skipping them fixes it. */
	const unblock = $derived(
		results?.requiredCount
			? { role: 'optional' as const, label: 'Make optional' }
			: { role: 'skip' as const, label: 'Skip' }
	);
	/** People who are the only one missing from at least two of the listed near misses. */
	const topBlockers = (items: Group['items']) =>
		blockers(items)
			.filter((b) => b.count >= 2)
			.slice(0, 3);
	const anythingPinned = $derived(!!app.pinnedBlock || !!app.pinnedSet);
</script>

<Section title="Best times" count={total}>
	<div class="space-y-4 px-4 pb-5">
		<!-- Without the heatmap, a time opened from a shared link shows up here instead. -->
		{#if !layout.showHeatmap && app.selectedBlocks.length}
			<PickedTime />
		{/if}

		<div class="space-y-2.5">
			<DurationPicker />
			<div class="flex items-center gap-2">
				<span id="per-week-label" class="text-[13px] text-fg-2">Meetings a week</span>
				<div
					class="ml-auto flex rounded-lg bg-subtle p-0.5"
					role="group"
					aria-labelledby="per-week-label"
				>
					{#each PER_WEEK as option (option.value)}
						<button
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-colors {app.perWeek ===
							option.value
								? 'bg-accent text-on-accent'
								: 'text-fg-2 hover:text-fg'}"
							aria-pressed={app.perWeek === option.value}
							onclick={() => app.setPerWeek(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
			{#if sets}
				<p class="text-xs text-fg-3">
					About the same time each day, with a day off between, like Mon/Wed/Fri or Tue/Thu.
				</p>
			{/if}
		</div>

		{#if app.viewLabel}
			<div class="flex items-center gap-2 rounded-lg bg-accent-soft/60 py-1.5 pr-1.5 pl-3 text-xs">
				<span class="min-w-0 flex-1 truncate text-accent-fg">
					Times for <strong class="font-semibold">{app.viewLabel}</strong> only
				</span>
				<button class="btn btn-ghost btn-sm" onclick={() => app.showEveryone()}>
					Show everyone
				</button>
			</div>
		{/if}

		{#if results && results.considered === 0}
			<p class="rounded-lg bg-subtle px-3 py-3 text-[13px] text-fg-2">
				Everyone is skipped. Mark someone as required or optional to find times.
			</p>
		{:else if results && total === 0}
			<div class="rounded-lg bg-subtle px-3 py-3 text-[13px] text-fg-2">
				<p class="font-medium text-fg">
					Nothing fits a {formatDuration(app.duration)} meeting{sets ? ` ${phrase}` : ''}
				</p>
				<p class="mt-1">
					{#if sets}
						Try a shorter meeting, meeting less often, or marking someone as optional.
					{:else if results.requiredCount > 0}
						Try a shorter meeting, or mark someone as optional.
					{:else}
						No one is required, so try a shorter meeting or skip someone who can’t make it.
					{/if}
				</p>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#if app.duration > MIN_DURATION}
						<button
							class="btn btn-secondary btn-sm"
							onclick={() => app.setDuration(app.duration / 2)}
						>
							Try {formatDuration(Math.max(MIN_DURATION, Math.round(app.duration / 2 / 15) * 15))}
						</button>
					{/if}
					{#if app.perWeek > 1}
						{@const fewer = PER_WEEK[app.perWeek - 2]}
						<button class="btn btn-secondary btn-sm" onclick={() => app.setPerWeek(fewer.value)}>
							Try {fewer.phrase}
						</button>
					{/if}
				</div>
			</div>
		{/if}

		{#if total > 1 && !sets}
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

		{#if total && !anythingPinned}
			<p class="text-xs text-fg-3">
				{#if sets}
					{layout.showHeatmap
						? 'Click an option to see its meetings on the grid and add them to your calendar.'
						: 'Tap an option to see who can make each meeting and add them to your calendar.'}
				{:else}
					{layout.showHeatmap
						? 'Click a time to see it on the grid and add it to Google Calendar.'
						: 'Tap a time to see who can make it and add it to Google Calendar.'}
				{/if}
			</p>
		{/if}

		{#each shown as group (group.key)}
			{@const open = expanded[group.key]}
			<div>
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<h3 class="text-xs font-semibold text-fg">
						{group.title}
						<span class="ml-1 font-normal text-fg-3 tabular">{group.items.length}</span>
					</h3>
					{#if group.hint}<span class="truncate text-[11px] text-fg-3">{group.hint}</span>{/if}
				</div>
				{#if group.key === 'near'}
					{@const blocking = topBlockers(group.items)}
					{#if blocking.length}
						<ul class="mb-2 space-y-0.5 rounded-lg bg-subtle py-1 pr-1 pl-3 text-xs text-fg-2">
							{#each blocking as { id, count } (id)}
								<li class="flex items-center gap-2">
									<span class="min-w-0 flex-1">
										<strong class="font-medium text-fg">{names.get(id)}</strong> is the only one
										missing from <span class="tabular">{count}</span> of these
									</span>
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => app.setRole(id, unblock.role)}
									>
										{unblock.label}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
				<ul class="space-y-2">
					{#each open ? group.items : group.items.slice(0, LIMIT) as item (item.id)}
						{#if sets}
							<SetCard set={item as MeetingSet} />
						{:else}
							<BlockCard block={item as TimeBlock} />
						{/if}
					{/each}
				</ul>
				{#if group.items.length > LIMIT}
					<button
						class="btn btn-ghost btn-sm mt-1.5 w-full"
						onclick={() => (expanded[group.key] = !open)}
					>
						{open ? 'Show fewer' : `Show ${group.items.length - LIMIT} more`}
					</button>
				{/if}
			</div>
		{/each}
	</div>
</Section>
