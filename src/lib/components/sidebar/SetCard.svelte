<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Link from '@lucide/svelte/icons/link';
	import { page } from '$app/state';
	import {
		formatDay,
		formatDuration,
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

	/** Two or three meetings a week, like BlockCard is for one. */
	let { set }: { set: MeetingSet } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const pinned = $derived(app.pinnedSet?.id === set.id);
	const length = $derived(app.duration * 60);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const always = $derived(event.people.filter((p) => set.always.includes(p.id)));
	const summary = $derived(formatMeetingSet(set.starts, app.duration, zone));

	/** Who misses which meetings: "Sam (Wed)". */
	const misses = $derived(
		set.missing.map((id) => ({
			id,
			name: names.get(id) ?? '?',
			optional: app.roleOf(id) === 'optional',
			days: formatList(
				set.sessions.filter((s) => s.missing.includes(id)).map((s) => formatWeekday(s.start, zone))
			)
		}))
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
	const nameOf = (id: number) =>
		(names.get(id) ?? '?') + (app.roleOf(id) === 'optional' ? ' (optional)' : '');
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
		class="w-full px-3.5 py-3 text-left"
		aria-expanded={pinned}
		onclick={toggle}
		onfocus={() => (app.hoveredSet = set)}
		onblur={() => (app.hoveredSet = null)}
	>
		<span class="flex items-baseline justify-between gap-2">
			<span class="text-xs font-medium text-fg-2">{summary.days}</span>
			<span class="shrink-0 text-[11px] text-fg-3 tabular">
				{formatDuration(app.duration)} each{set.flex
					? ` · ${formatDuration(set.flex / 60)} leeway`
					: ''}
			</span>
		</span>
		<span class="mt-0.5 flex items-center justify-between gap-2">
			{#if set.spread === 0}
				<span class="text-[15px] font-semibold tracking-tight tabular">
					{formatTimeRange(set.sessions[0].start, set.sessions[0].end, zone)}
				</span>
			{:else}
				<span class="text-[13px] font-semibold tracking-tight tabular">{summary.times}</span>
			{/if}
			<span
				class="flex shrink-0 items-center gap-1 text-[11px] font-medium {pinned
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
				{#each always.slice(0, 6) as person (person.id)}
					<Avatar id={person.id} name={person.name} size={18} class="ring-2 ring-surface" />
				{/each}
			</span>
			{#if always.length > 6}
				<span class="text-[11px] text-fg-3">+{always.length - 6}</span>
			{/if}
			<span class="min-w-0 flex-1 truncate text-xs text-fg-3">
				{#if misses.length}
					Without {misses
						.map((m) => `${m.name.split(' ')[0]}${m.optional ? ' (opt.)' : ''} (${m.days})`)
						.join(', ')}
				{:else}
					All {always.length}, every time
				{/if}
			</span>
		</span>
	</button>

	{#if pinned}
		<div class="space-y-2.5 border-t border-line px-3.5 pt-2.5 pb-3">
			<ul class="space-y-2">
				{#each set.sessions as session, i (session.id)}
					{@const start = starts[i]}
					<li class="text-xs">
						{#if !layout.showHeatmap}
							<div class="mb-1.5"><DayStrip block={session} /></div>
						{/if}
						<p class="text-fg">
							<span class="font-medium">{formatDay(start, zone, event.weekly)}</span>
							· <span class="tabular">{formatTimeRange(start, start + length, zone)}</span>
						</p>
						<p class="text-fg-3">
							{#if session.missing.length}
								Without {session.missing
									.map((id) => names.get(id) + (app.roleOf(id) === 'optional' ? ' (optional)' : ''))
									.join(', ')}
							{:else}
								Everyone
							{/if}
						</p>
					</li>
				{/each}
			</ul>
			{#if misses.length && always.length}
				<p class="text-xs text-fg-2">
					Every time: {always.map((p) => p.name).join(', ')}
				</p>
			{/if}
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
					Adds weekly meetings starting {formatDay(meetings[0].start, app.zone, false)}, in {app.zone.replaceAll(
						'_',
						' '
					)} time.
				</p>
			{:else}
				<label class="flex items-center gap-2 text-xs text-fg-2">
					<input type="checkbox" class="size-3.5 accent-accent" bind:checked={repeat} />
					Repeat every week in the calendar
				</label>
			{/if}
			<CalendarButtons {meetings} zone={app.zone}>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() =>
						copyText(
							app.shareLink(
								page.url.origin,
								starts.map((t) => ({ start: t, end: t + length }))
							),
							'Link to these times copied'
						)}
					title="Opens this event with these times highlighted"
				>
					<Link class="size-3.5" aria-hidden="true" />
					Link
				</button>
				<button class="btn btn-secondary btn-sm" onclick={copy}>
					<Copy class="size-3.5" aria-hidden="true" />
					Copy
				</button>
			</CalendarButtons>
		</div>
	{/if}
</li>
