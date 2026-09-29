<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { blockers, type TimeBlock } from '$lib/analysis/bestTimes';
	import { DURATION_STEP, MIN_DURATION } from '$lib/analysis/duration';
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

	const PER_WEEK: { value: MeetingsPerWeek; label: string; phrase: string }[] = [
		{ value: 1, label: 'Once', phrase: 'once a week' },
		{ value: 2, label: 'Twice', phrase: 'twice a week' },
		{ value: 3, label: '3 times', phrase: 'three times a week' }
	];

	let expanded = $state<Record<string, boolean>>({});

	/** Meeting two or three times a week lists sets of times instead of single ones. */
	const sets = $derived(app.meetingSets);
	const results = $derived(sets ?? app.best);
	const considered = $derived(results?.considered ?? 0);
	const phrase = $derived(PER_WEEK.find((p) => p.value === app.perWeek)!.phrase);

	type Result = TimeBlock | MeetingSet;

	interface Group {
		key: string;
		title: string;
		items: Result[];
	}

	/**
	 * Only results that work for everyone, or for every required person when some are optional. For
	 * two or three meetings a week, that's at every meeting.
	 */
	const shown = $derived.by(() => {
		if (!results) return [];
		const out: Group[] = [{ key: 'everyone', title: 'Everyone', items: results.everyone }];
		if (results.requiredCount && results.requiredCount < results.considered) {
			out.push({ key: 'required', title: 'All required people', items: results.required });
		}
		return out.filter((group) => group.items.length);
	});
	const total = $derived(shown.reduce((n, g) => n + g.items.length, 0));

	const names = $derived(new Map((app.event?.people ?? []).map((p) => [p.id, p.name])));
	/** With no one required, a near miss is one optional person short; skipping them fixes it. */
	const unblock = $derived(
		results?.requiredCount
			? { role: 'optional' as const, label: 'Make optional' }
			: { role: 'skip' as const, label: 'Skip' }
	);
	/** When nothing fits, the people who are the only one missing from the most near misses. */
	const suggestions = $derived(results ? blockers(results.near).slice(0, 3) : []);
	const who = $derived(
		results?.requiredCount && results.requiredCount < results.considered
			? 'all required people'
			: 'everyone'
	);
	/** What to try with roles when no one person is to blame, given who's already optional. */
	const roleHint = $derived.by(() => {
		if (!results) return '';
		const required = results.requiredCount;
		if (!required) return 'No one is required. Mark who has to be there as required.';
		if (required === results.considered) return 'Try marking someone as optional.';
		if (required > 1) return 'Try marking someone else as optional.';
		const only = app.event?.people.find((p) => app.effectiveRoleOf(p.id) === 'required');
		return `Nothing fits ${only?.name ?? 'the one required person'} either.`;
	});
	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
</script>

<Section title="Best times" count={total}>
	<div class="space-y-4 px-4 pb-5">
		<!-- Without the heatmap, a time opened from a shared link shows up here instead. -->
		{#if !layout.showHeatmap && app.selectedBlocks.length}
			<PickedTime />
		{/if}

		<div class="space-y-3">
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
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-colors pointer-coarse:h-9 pointer-coarse:px-3 {app.perWeek ===
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
		</div>

		{#if app.viewLabel}
			<button
				class="inline-flex h-7 max-w-full items-center gap-1 rounded-lg bg-accent-soft pr-2 pl-2.5 text-xs font-medium text-accent-fg pointer-coarse:h-9"
				onclick={() => app.showEveryone()}
				title="Show times for everyone"
			>
				<span class="truncate">{app.viewLabel} only</span>
				<X class="size-3.5 shrink-0 pointer-coarse:size-4.5" aria-hidden="true" />
			</button>
		{/if}

		{#if results && considered === 0}
			<p class="text-[13px] text-fg-2">
				Everyone is skipped. Mark someone as required or optional to find times.
			</p>
		{:else if results && total === 0}
			{@const shorter = Math.max(
				MIN_DURATION,
				Math.floor(app.duration / 2 / DURATION_STEP) * DURATION_STEP
			)}
			<div class="rounded-lg bg-subtle px-3 py-3 text-[13px]">
				<p class="font-medium text-fg">
					Nothing fits {who} for a {formatDuration(app.duration)} meeting{sets ? ` ${phrase}` : ''}
				</p>
				{#if suggestions.length}
					<ul class="mt-2 space-y-2">
						{#each suggestions as blocker (blocker.id)}
							<li class="flex items-center gap-2 text-xs text-fg-2">
								<span class="min-w-0 flex-1 leading-snug text-pretty">
									<strong class="font-medium text-fg">{names.get(blocker.id)}</strong>
									is the only {who === 'everyone' ? 'one' : 'required person'} missing from
									<span class="tabular">{plural(blocker.count, sets ? 'option' : 'time')}</span>
								</span>
								<button
									class="btn btn-ghost btn-sm shrink-0"
									onclick={() => app.setRole(blocker.id, unblock.role)}
								>
									{unblock.label}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-1 text-fg-2">{roleHint}</p>
				{/if}
				{#if app.duration > MIN_DURATION || app.perWeek > 1}
					<div class="mt-2.5 flex flex-wrap gap-1.5">
						{#if app.duration > MIN_DURATION}
							<button class="btn btn-secondary btn-sm" onclick={() => app.setDuration(shorter)}>
								Try {formatDuration(shorter)}
							</button>
						{/if}
						{#if app.perWeek > 1}
							{@const fewer = PER_WEEK[app.perWeek - 2]}
							<button class="btn btn-secondary btn-sm" onclick={() => app.setPerWeek(fewer.value)}>
								Try {fewer.phrase}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#each shown as group (group.key)}
			{@const open = expanded[group.key]}
			<div>
				<h3 class="mb-2 text-xs font-semibold text-fg">
					{group.title}
					<span class="ml-1 font-normal text-fg-3 tabular">{group.items.length}</span>
				</h3>
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
