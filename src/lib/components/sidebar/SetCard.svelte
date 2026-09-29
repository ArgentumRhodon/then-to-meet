<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Link from '@lucide/svelte/icons/link';
	import { page } from '$app/state';
	import { formatDay, formatMeetingSet, formatTimeRange } from '$lib/analysis/format';
	import type { MeetingSet } from '$lib/analysis/meetingSets';
	import { meetingsFor } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import Attendees from './Attendees.svelte';
	import CalendarButtons from './CalendarButtons.svelte';
	import DayStrip from './DayStrip.svelte';
	import MissingList from './MissingList.svelte';
	import StartStepper from './StartStepper.svelte';

	/** Two or three meetings a week, like BlockCard is for one. */
	let { set }: { set: MeetingSet } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedSet?.id === set.id);
	const length = $derived(app.duration * 60);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const always = $derived(event.people.filter((p) => set.always.includes(p.id)));
	const summary = $derived(formatMeetingSet(set.starts, app.duration, zone));
	const nameOf = (id: number) =>
		(names.get(id) ?? '?') + (app.roleOf(id) === 'optional' ? ' (optional)' : '');

	// Every meeting can move later together, up to `flex`, with the same people; the pinned card's
	// arrows pick how far, and the heatmap highlights the meetings at that shift.
	const positions = $derived(set.flex / event.slotSeconds + 1);
	const position = $derived(pinned ? app.shiftFor(set.sessions[0]) : 0);
	/** An open card with room to move gets its times as a stepper. */
	const stepping = $derived(pinned && positions > 1);
	const starts = $derived(set.starts.map((t) => t + position * event.slotSeconds));
	/** The meetings' times at that shift: one range when they all match. */
	const times = $derived(
		set.spread === 0
			? formatTimeRange(starts[0], starts[0] + length, zone)
			: formatMeetingSet(starts, app.duration, zone).times
	);

	/** Weekly polls always repeat; a dated poll can keep the set to its one week. */
	let repeat = $state(true);
	const meetings = $derived(
		meetingsFor(
			event,
			set.sessions.map((s, i) => ({
				start: starts[i],
				end: starts[i] + length,
				attendees: s.attendees,
				missing: s.missing
			})),
			app.zone,
			repeat,
			nameOf
		)
	);

	const toggle = () => app.pinSet(pinned ? null : set);

	const copy = () => {
		const { days, times } = formatMeetingSet(starts, app.duration, zone);
		copyText(
			`${event.title}: ${days} · ${times}` +
				(event.weekly ? '' : ` (${zone.replaceAll('_', ' ')})`) +
				(event.weekly || repeat ? ', every week' : '')
		);
	};
</script>

<li
	data-result
	class="rounded-xl border transition-colors {pinned
		? 'border-accent bg-surface shadow-card'
		: 'border-line bg-surface hover:border-line-strong'}"
	onpointerenter={() => (app.hoveredSet = set)}
	onpointerleave={() => (app.hoveredSet = null)}
>
	<div>
		<button
			class="w-full px-3.5 pt-2.5 text-left {stepping ? 'pb-1.5' : 'pb-2.5'}"
			aria-expanded={pinned}
			onclick={toggle}
			onfocus={() => (app.hoveredSet = set)}
			onblur={() => (app.hoveredSet = null)}
		>
			<span class="flex items-center justify-between gap-2">
				<span class="text-xs font-medium text-fg-2">{summary.days}</span>
				<ChevronDown
					class="size-3.5 text-fg-3 transition-transform {pinned ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</span>
			{#if !stepping}
				<span
					class="mt-0.5 block font-semibold tracking-tight tabular {set.spread === 0
						? 'text-[15px]'
						: 'text-[13px]'}"
				>
					{#if pinned}
						{times}
					{:else if set.spread === 0}
						{formatTimeRange(set.sessions[0].start, set.sessions[0].end, zone)}
					{:else}
						{summary.times}
					{/if}
				</span>
			{/if}
		</button>
		<!-- Closed, the whole window; open with room to move, the meetings its arrows have picked. -->
		{#if stepping}
			<div class="px-2.5 pb-2.5">
				<StartStepper label={times} {position} count={positions} />
			</div>
		{/if}
	</div>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
			<Attendees people={always} />
			<ul class="space-y-2.5">
				{#each set.sessions as session, i (session.id)}
					{@const start = starts[i]}
					<li class="space-y-1">
						{#if !layout.showHeatmap}
							<DayStrip block={session} />
						{/if}
						<p class="text-xs text-fg">
							<span class="font-medium">{formatDay(start, zone, event.weekly)}</span>
							· <span class="tabular">{formatTimeRange(start, start + length, zone)}</span>
						</p>
						{#if session.missing.length}
							<MissingList
								people={session.missing.map((id) => ({
									name: names.get(id) ?? '?',
									role: app.roleOf(id)
								}))}
								total={session.attendees.length + session.missing.length}
							/>
						{/if}
					</li>
				{/each}
			</ul>
			{#if !event.weekly}
				<label class="flex items-center gap-2 text-xs text-fg-2">
					<input type="checkbox" class="size-3.5 accent-accent" bind:checked={repeat} />
					Repeat weekly
				</label>
			{/if}
			<CalendarButtons {meetings} zone={app.zone}>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={() =>
						copyText(
							app.shareLink(
								page.url.origin,
								starts.map((t) => ({ start: t, end: t + length }))
							),
							'Link to these times copied'
						)}
					aria-label="Copy link to these times"
					title="Copy a link that opens this event with these times highlighted"
				>
					<Link class="size-3.5" />
				</button>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={copy}
					aria-label="Copy as text"
					title="Copy these times as text"
				>
					<Copy class="size-3.5" />
				</button>
			</CalendarButtons>
		</div>
	{/if}
</li>
