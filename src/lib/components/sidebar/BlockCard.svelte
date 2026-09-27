<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Link from '@lucide/svelte/icons/link';
	import { page } from '$app/state';
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatDay, formatTime, formatTimeRange } from '$lib/analysis/format';
	import { downloadIcs, googleCalendarUrl, meetingFor } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import DayStrip from './DayStrip.svelte';
	import MissingList from './MissingList.svelte';

	let { block }: { block: TimeBlock } = $props();

	const AVATARS = 5;

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedBlock?.id === block.id);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const attendees = $derived(event.people.filter((p) => block.attendees.includes(p.id)));
	const missingNames = $derived(
		block.missing.map(
			(id) => (names.get(id) ?? '?') + (app.roleOf(id) === 'optional' ? ' (optional)' : '')
		)
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
	const meeting = $derived(meetingFor(event, start, end, app.zone));
	const dayLabel = $derived(formatDay(block.start, zone, event.weekly));

	const toggle = () => app.pinBlock(pinned ? null : block);

	const copy = () =>
		copyText(
			`${event.title}: ${dayLabel} · ${formatTimeRange(start, end, zone)}` +
				(event.weekly ? '' : ` (${zone.replaceAll('_', ' ')})`)
		);
</script>

<li
	data-result
	class="rounded-xl border transition-colors {pinned
		? 'border-accent bg-surface shadow-card'
		: 'border-line bg-surface hover:border-line-strong'}"
	onpointerenter={() => (app.hoveredBlock = block)}
	onpointerleave={() => (app.hoveredBlock = null)}
>
	<button
		class="w-full px-3.5 py-2.5 text-left"
		aria-expanded={pinned}
		onclick={toggle}
		onfocus={() => (app.hoveredBlock = block)}
		onblur={() => (app.hoveredBlock = null)}
	>
		<span class="flex items-center justify-between gap-2">
			<span class="text-xs font-medium text-fg-2">{dayLabel}</span>
			<ChevronDown
				class="size-3.5 text-fg-3 transition-transform {pinned ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</span>
		<span class="mt-0.5 flex items-center justify-between gap-3">
			<span class="text-[15px] font-semibold tracking-tight tabular">
				{formatTimeRange(block.start, block.end, zone)}
			</span>
			<span class="flex shrink-0 items-center gap-1">
				<span class="flex -space-x-1.5">
					{#each attendees.slice(0, AVATARS) as person (person.id)}
						<Avatar id={person.id} name={person.name} size={18} class="ring-2 ring-surface" />
					{/each}
				</span>
				{#if attendees.length > AVATARS}
					<span class="text-[11px] text-fg-3 tabular">+{attendees.length - AVATARS}</span>
				{/if}
			</span>
		</span>
		{#if block.missing.length}
			<span class="mt-1 block truncate text-xs text-fg-3">
				Without {block.missing.map((id) => names.get(id)?.split(' ')[0]).join(', ')}
			</span>
		{/if}
	</button>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
			{#if !layout.showHeatmap}
				<DayStrip {block} />
			{/if}
			{#if missingNames.length}
				<MissingList names={missingNames} />
			{/if}
			{#if starts.length > 1}
				<label class="flex items-center justify-between gap-2 text-xs text-fg-2">
					Start at
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
				<p class="text-xs text-fg-3">
					Repeats weekly from {formatDay(meeting.start, app.zone, false)}
				</p>
			{/if}
			<div class="flex items-center gap-1">
				<a
					class="btn btn-secondary btn-sm mr-auto"
					href={googleCalendarUrl(meeting)}
					target="_blank"
					rel="noopener noreferrer"
				>
					<CalendarPlus class="size-3.5" aria-hidden="true" />
					Google Calendar
				</a>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={() => downloadIcs(meeting)}
					aria-label="Download .ics"
					title="Download .ics for Apple Calendar, Outlook, and others"
				>
					<Download class="size-3.5" />
				</button>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={() =>
						copyText(app.shareLink(page.url.origin, [{ start, end }]), 'Link to this time copied')}
					aria-label="Copy link to this time"
					title="Copy a link that opens this event with this time highlighted"
				>
					<Link class="size-3.5" />
				</button>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={copy}
					aria-label="Copy as text"
					title="Copy this time as text"
				>
					<Copy class="size-3.5" />
				</button>
			</div>
		</div>
	{/if}
</li>
