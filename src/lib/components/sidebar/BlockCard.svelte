<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatDay, formatDuration, formatTime, formatTimeRange } from '$lib/analysis/format';
	import { downloadIcs, googleCalendarUrl, nextWeeklyOccurrence } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import { eventUrl } from '$lib/w2m/id';
	import DayStrip from './DayStrip.svelte';

	let { block }: { block: TimeBlock } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedBlock?.id === block.id);
	const minutes = $derived((block.end - block.start) / 60);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const attendees = $derived(event.people.filter((p) => block.attendees.includes(p.id)));
	const missing = $derived(
		block.missing.map((id) => ({
			id,
			name: names.get(id) ?? '?',
			optional: app.roleOf(id) === 'optional'
		}))
	);

	// A long window fits the meeting at several start times; let the user pick one for export.
	const starts = $derived.by(() => {
		const out: number[] = [];
		for (let t = block.start; t + app.duration * 60 <= block.end; t += event.slotSeconds)
			out.push(t);
		return out;
	});
	let chosenStart = $state<number | null>(null);
	const start = $derived(
		chosenStart !== null && starts.includes(chosenStart) ? chosenStart : block.start
	);
	const end = $derived(start + app.duration * 60);
	// Weekly polls have no real dates, so export the next occurrence as a weekly repeating event
	// in the viewer's own timezone.
	const meeting = $derived.by(() => {
		const at = event.weekly ? nextWeeklyOccurrence(start, app.zone) : start;
		return {
			title: event.title,
			start: at,
			end: at + app.duration * 60,
			details: `Picked with ThenToMeet from ${event.id === 'demo' ? 'a demo poll' : eventUrl(event.id)}`,
			repeatWeeklyIn: event.weekly ? app.zone : undefined
		};
	});
	const dayLabel = $derived(formatDay(block.start, zone, event.weekly));
	const weeklyNote = $derived(
		`Adds a weekly meeting starting ${formatDay(meeting.start, app.zone, false)}, ` +
			`in ${app.zone.replaceAll('_', ' ')} time.`
	);

	const toggle = () => {
		app.pinnedBlock = pinned ? null : block;
	};

	const copy = () =>
		copyText(
			`${event.title}: ${dayLabel} · ${formatTimeRange(start, end, zone)}` +
				(event.weekly ? '' : ` (${zone.replaceAll('_', ' ')})`)
		);
</script>

<li
	class="rounded-xl border transition-colors {pinned
		? 'border-accent bg-surface shadow-card'
		: 'border-line bg-surface hover:border-line-strong'}"
	onpointerenter={() => (app.hoveredBlock = block)}
	onpointerleave={() => (app.hoveredBlock = null)}
>
	<button
		class="w-full px-3.5 py-3 text-left"
		aria-expanded={pinned}
		onclick={toggle}
		onfocus={() => (app.hoveredBlock = block)}
		onblur={() => (app.hoveredBlock = null)}
	>
		<span class="flex items-baseline justify-between gap-2">
			<span class="text-xs font-medium text-fg-2">{dayLabel}</span>
			<span class="text-[11px] text-fg-3 tabular">{formatDuration(minutes)} window</span>
		</span>
		<span class="mt-0.5 flex items-center justify-between gap-2">
			<span class="text-[15px] font-semibold tracking-tight tabular">
				{formatTimeRange(block.start, block.end, zone)}
			</span>
			<span
				class="flex items-center gap-1 text-[11px] font-medium {pinned
					? 'text-fg-2'
					: 'text-accent-fg'}"
			>
				{#if !pinned}<CalendarPlus class="size-3.5" aria-hidden="true" />{/if}
				<ChevronDown
					class="size-3.5 transition-transform {pinned ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</span>
		</span>
		<span class="mt-2 flex items-center gap-2">
			<span class="flex -space-x-1.5">
				{#each attendees.slice(0, 6) as person (person.id)}
					<Avatar id={person.id} name={person.name} size={18} class="ring-2 ring-surface" />
				{/each}
			</span>
			{#if attendees.length > 6}
				<span class="text-[11px] text-fg-3">+{attendees.length - 6}</span>
			{/if}
			<span class="min-w-0 flex-1 truncate text-xs text-fg-3">
				{#if missing.length}
					Without {missing
						.map((m) => m.name.split(' ')[0] + (m.optional ? ' (opt.)' : ''))
						.join(', ')}
				{:else}
					All {attendees.length}
				{/if}
			</span>
		</span>
	</button>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
			{#if !layout.showHeatmap}
				<DayStrip {block} />
			{/if}
			<p class="text-xs text-fg-2">
				{missing.length ? 'Can make it' : 'Everyone can make it'}: {attendees
					.map((p) => p.name)
					.join(', ')}
			</p>
			{#if missing.length}
				<p class="text-xs text-fg-2">
					Can’t make it: {missing.map((m) => m.name + (m.optional ? ' (optional)' : '')).join(', ')}
				</p>
			{/if}
			{#if starts.length > 1}
				<label class="flex items-center justify-between gap-2 text-xs text-fg-2">
					Start the {formatDuration(app.duration)} meeting at
					<select
						class="h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg tabular"
						value={start}
						onchange={(e) => (chosenStart = Number(e.currentTarget.value))}
					>
						{#each starts as t (t)}
							<option value={t}>{formatTime(t, zone)}</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if event.weekly}
				<p class="text-xs text-fg-3">{weeklyNote}</p>
			{/if}
			<div class="flex flex-wrap gap-1.5">
				<a
					class="btn btn-secondary btn-sm"
					href={googleCalendarUrl(meeting)}
					target="_blank"
					rel="noopener noreferrer"
				>
					<CalendarPlus class="size-3.5" aria-hidden="true" />
					Google Calendar
				</a>
				<button class="btn btn-secondary btn-sm" onclick={() => downloadIcs(meeting)}>
					<Download class="size-3.5" aria-hidden="true" />
					.ics
				</button>
				<button class="btn btn-secondary btn-sm" onclick={copy}>
					<Copy class="size-3.5" aria-hidden="true" />
					Copy
				</button>
			</div>
		</div>
	{/if}
</li>
