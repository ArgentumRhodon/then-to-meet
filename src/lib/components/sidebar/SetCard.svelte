<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Link from '@lucide/svelte/icons/link';
	import { page } from '$app/state';
	import {
		formatDay,
		formatList,
		formatMeetingSet,
		formatTime,
		formatTimeRange,
		formatWeekday
	} from '$lib/analysis/format';
	import type { MeetingSet } from '$lib/analysis/meetingSets';
	import { meetingsFor } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import CalendarButtons from './CalendarButtons.svelte';
	import DayStrip from './DayStrip.svelte';
	import MissingList from './MissingList.svelte';

	/** Two or three meetings a week, like BlockCard is for one. */
	let { set }: { set: MeetingSet } = $props();

	const AVATARS = 5;

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedSet?.id === set.id);
	const length = $derived(app.duration * 60);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const always = $derived(event.people.filter((p) => set.always.includes(p.id)));
	const summary = $derived(formatMeetingSet(set.starts, app.duration, zone));
	const nameOf = (id: number) =>
		(names.get(id) ?? '?') + (app.roleOf(id) === 'optional' ? ' (optional)' : '');

	/** Who misses which meetings: "Sam (Wed)". */
	const misses = $derived(
		set.missing.map(
			(id) =>
				`${names.get(id)?.split(' ')[0]} (${formatList(
					set.sessions
						.filter((s) => s.missing.includes(id))
						.map((s) => formatWeekday(s.start, zone))
				)})`
		)
	);

	// Every meeting can move later together, up to `flex`, with the same people; pick how far.
	const shifts = $derived(
		Array.from({ length: set.flex / event.slotSeconds + 1 }, (_, i) => i * event.slotSeconds)
	);
	let chosenShift = $state(0);
	const shift = $derived(shifts.includes(chosenShift) ? chosenShift : 0);
	const starts = $derived(set.starts.map((t) => t + shift));
	const shiftLabel = (s: number) =>
		set.spread === 0
			? formatTime(set.starts[0] + s, zone)
			: formatMeetingSet(
					set.starts.map((t) => t + s),
					app.duration,
					zone
				).times;

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
	<button
		class="w-full px-3.5 py-2.5 text-left"
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
		<span class="mt-0.5 flex items-center justify-between gap-3">
			{#if set.spread === 0}
				<span class="text-[15px] font-semibold tracking-tight tabular">
					{formatTimeRange(set.sessions[0].start, set.sessions[0].end, zone)}
				</span>
			{:else}
				<span class="text-[13px] font-semibold tracking-tight tabular">{summary.times}</span>
			{/if}
			<span class="flex shrink-0 items-center gap-1">
				<span class="flex -space-x-1.5">
					{#each always.slice(0, AVATARS) as person (person.id)}
						<Avatar id={person.id} name={person.name} size={18} class="ring-2 ring-surface" />
					{/each}
				</span>
				{#if always.length > AVATARS}
					<span class="text-[11px] text-fg-3 tabular">+{always.length - AVATARS}</span>
				{/if}
			</span>
		</span>
		{#if misses.length}
			<span class="mt-1 block truncate text-xs text-fg-3">Without {misses.join(', ')}</span>
		{/if}
	</button>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
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
							<MissingList names={session.missing.map(nameOf)} />
						{/if}
					</li>
				{/each}
			</ul>
			{#if shifts.length > 1}
				<label class="flex items-center justify-between gap-2 text-xs text-fg-2">
					Start {set.sessions.length === 2 ? 'both' : 'all three'} at
					<select
						class="h-7 min-w-0 rounded-md border border-line bg-surface px-2 text-xs text-fg tabular"
						value={shift}
						onchange={(e) => (chosenShift = Number(e.currentTarget.value))}
					>
						{#each shifts as s (s)}
							<option value={s}>{shiftLabel(s)}</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if event.weekly}
				<p class="text-xs text-fg-3">
					Repeats weekly from {formatDay(meetings[0].start, app.zone, false)}
				</p>
			{:else}
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
