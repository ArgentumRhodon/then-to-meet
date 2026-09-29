<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Link from '@lucide/svelte/icons/link';
	import { page } from '$app/state';
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatDay, formatTimeRange } from '$lib/analysis/format';
	import { downloadIcs, googleCalendarUrl, meetingFor } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import Attendees from './Attendees.svelte';
	import DayStrip from './DayStrip.svelte';
	import MissingList from './MissingList.svelte';
	import StartStepper from './StartStepper.svelte';

	let { block }: { block: TimeBlock } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedBlock?.id === block.id);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const attendees = $derived(event.people.filter((p) => block.attendees.includes(p.id)));
	const missing = $derived(
		block.missing.map((id) => ({ name: names.get(id) ?? '?', role: app.roleOf(id) }))
	);

	// A long window fits the meeting at several start times; the pinned card's arrows pick one, and
	// that's the time the heatmap highlights and the calendar and links use.
	const positions = $derived(app.shiftRoom(block) + 1);
	const position = $derived(pinned ? app.shiftFor(block) : 0);
	const start = $derived(block.start + position * event.slotSeconds);
	const end = $derived(start + app.duration * 60);
	/** An open card with room to move gets its time as a stepper. */
	const stepping = $derived(pinned && positions > 1);
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
	<div>
		<button
			class="w-full px-3.5 pt-2.5 text-left {stepping ? 'pb-1.5' : 'pb-2.5'}"
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
			{#if !stepping}
				<span class="mt-0.5 block text-[15px] font-semibold tracking-tight tabular">
					{formatTimeRange(pinned ? start : block.start, pinned ? end : block.end, zone)}
				</span>
			{/if}
		</button>
		<!-- Closed, the whole window; open with room to move, the meeting its arrows have picked. -->
		{#if stepping}
			<div class="px-2.5 pb-2.5">
				<StartStepper label={formatTimeRange(start, end, zone)} {position} count={positions} />
			</div>
		{/if}
	</div>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
			{#if !layout.showHeatmap}
				<DayStrip {block} />
			{/if}
			<Attendees people={attendees} />
			{#if missing.length}
				<MissingList people={missing} total={block.attendees.length + block.missing.length} />
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
