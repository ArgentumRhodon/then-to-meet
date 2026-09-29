<script lang="ts">
	import Link from '@lucide/svelte/icons/link';
	import X from '@lucide/svelte/icons/x';
	import { page } from '$app/state';
	import {
		formatDay,
		formatDuration,
		formatList,
		formatTimeRange,
		formatWeekday
	} from '$lib/analysis/format';
	import { meetingFor, meetingsFor } from '$lib/share/calendar';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import CalendarButtons from '../sidebar/CalendarButtons.svelte';
	import MissingList from '../sidebar/MissingList.svelte';

	/**
	 * Times picked on the heatmap or opened from a shared link: who can't make them, and exports. Shift-clicking the heatmap adds more.
	 */
	const blocks = $derived(app.selectedBlocks);
	const several = $derived(blocks.length > 1);
	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);
	const names = $derived(new Map(event.people.map((p) => [p.id, p.name])));
	const nameOf = (id: number) =>
		(names.get(id) ?? '?') + (app.roleOf(id) === 'optional' ? ' (optional)' : '');

	/** People who can make every picked time, and everyone who misses at least one. */
	const always = $derived(
		event.people.filter((p) => blocks.every((b) => b.attendees.includes(p.id)))
	);
	const considered = $derived(blocks[0].attendees.length + blocks[0].missing.length);
	const misses = $derived(
		[...new Set(blocks.flatMap((b) => b.missing))].map((id) => ({
			name: names.get(id) ?? '?',
			role: app.roleOf(id),
			days: formatList(
				blocks.filter((b) => b.missing.includes(id)).map((b) => formatWeekday(b.start, zone))
			)
		}))
	);

	/** Weekly polls always repeat; several dated times can also become a weekly pattern. */
	let repeat = $state(false);
	const meetings = $derived(
		several
			? meetingsFor(event, blocks, app.zone, repeat, nameOf)
			: [meetingFor(event, blocks[0].start, blocks[0].end, app.zone)]
	);
</script>

<div class="popover p-3" role="region" aria-label={several ? 'Picked times' : 'Picked time'}>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			{#if several}
				<p class="text-xs text-fg-2">{blocks.length} picked times</p>
				<p class="text-[15px] font-semibold tracking-tight">
					{formatList(blocks.map((b) => formatWeekday(b.start, zone)))}
				</p>
			{:else}
				<p class="text-xs text-fg-2">
					{formatDay(blocks[0].start, zone, event.weekly)} · {formatDuration(
						(blocks[0].end - blocks[0].start) / 60
					)}
				</p>
				<p class="text-[15px] font-semibold tracking-tight tabular">
					{formatTimeRange(blocks[0].start, blocks[0].end, zone)}
				</p>
			{/if}
		</div>
		<span class="flex -space-x-1.5 pt-1">
			{#each always.slice(0, 5) as person (person.id)}
				<Avatar id={person.id} name={person.name} size={18} class="ring-2 ring-surface" />
			{/each}
		</span>
		<button
			class="btn btn-ghost btn-sm btn-icon -mt-0.5 -mr-1"
			onclick={() => app.clearPick()}
			aria-label={several ? 'Clear picked times' : 'Clear picked time'}
			title="Clear (Esc)"
		>
			<X class="size-4" />
		</button>
	</div>

	{#if several}
		<ul class="mt-2 space-y-1">
			{#each blocks as block (block.start)}
				<li class="flex items-center gap-2 text-xs">
					<span class="min-w-0 flex-1">
						<span class="text-fg">
							{formatDay(block.start, zone, event.weekly)} ·
							<span class="tabular">{formatTimeRange(block.start, block.end, zone)}</span>
						</span>
						<span class="block truncate text-fg-3">
							{block.missing.length
								? `${block.missing.length} can’t make it`
								: 'Everyone can make it'}
						</span>
					</span>
					<button
						class="btn btn-ghost btn-sm btn-icon shrink-0"
						onclick={() => app.unpick(block.start)}
						aria-label="Remove {formatDay(block.start, zone, event.weekly)}"
						title="Remove this time"
					>
						<X class="size-3.5" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-1.5">
		{#if !considered}
			<p class="text-xs text-fg-2">Everyone is skipped.</p>
		{:else if !misses.length}
			<p class="text-xs font-medium text-ok">Everyone can make it</p>
		{:else}
			<MissingList
				people={several ? misses.map((m) => ({ ...m, note: `misses ${m.days}` })) : misses}
				total={considered}
			/>
		{/if}
	</div>
	{#if event.weekly}
		<p class="mt-1 text-xs text-fg-3">
			Adds {several ? 'weekly meetings' : 'a weekly meeting'} starting {formatDay(
				meetings[0].start,
				app.zone,
				false
			)}, in {app.zone.replaceAll('_', ' ')} time.
		</p>
	{:else if several}
		<label class="mt-1.5 flex items-center gap-2 text-xs text-fg-2">
			<input type="checkbox" class="size-3.5 accent-accent" bind:checked={repeat} />
			Repeat every week in the calendar
		</label>
	{:else if layout.showHeatmap}
		<p class="mt-1 text-xs text-fg-3">Shift-click another time to add it.</p>
	{/if}

	<div class="mt-2.5 space-y-1.5">
		<CalendarButtons {meetings} zone={app.zone}>
			<button
				class="btn btn-ghost btn-sm btn-icon"
				onclick={() =>
					copyText(
						app.shareLink(page.url.origin),
						several ? 'Link to these times copied' : 'Link to this time copied'
					)}
				aria-label={several ? 'Copy link to these times' : 'Copy link to this time'}
				title={several
					? 'Copy a link that opens this event with these times highlighted'
					: 'Copy a link that opens this event with this time highlighted'}
			>
				<Link class="size-3.5" />
			</button>
		</CalendarButtons>
	</div>
</div>
