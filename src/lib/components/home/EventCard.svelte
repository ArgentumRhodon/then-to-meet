<script lang="ts">
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import { DateTime } from 'luxon';
	import { formatDuration, zonePlace } from '$lib/analysis/format';
	import {
		describeDays,
		describeTime,
		hasEnded,
		upcomingTimes,
		type EventOverview
	} from '$lib/analysis/overview';
	import { isNativeEventId } from '$lib/events/id';
	import type { EventPulse } from '$lib/events/model';
	import type { RecentEvent } from '$lib/events/userModel';
	import { perWeekPhrase } from '$lib/share/summary';
	import { localZone } from '$lib/state/app.svelte';
	import MiniHeatmap from './MiniHeatmap.svelte';

	let {
		item,
		pulse,
		now,
		onforget
	}: {
		item: RecentEvent;
		/** The latest counts, for a ThenToMeet event. */
		pulse?: EventPulse;
		/** Unix seconds, the same for every card. */
		now: number;
		onforget: () => void;
	} = $props();

	const overview = $derived(item.overview);
	const people = $derived(pulse?.responseCount ?? overview?.responses ?? item.people);
	/** People who responded since the overview was made, as far as the count can tell. */
	const joined = $derived(
		pulse && overview ? Math.max(0, pulse.responseCount - overview.responses) : 0
	);
	const ended = $derived(overview ? hasEnded(overview, now) : false);
	const upcoming = $derived(overview ? upcomingTimes(overview, now) : []);
	const next = $derived(upcoming[0]);
	/** Other times in the same tier that are still ahead. */
	const more = $derived(
		overview?.best
			? Math.max(0, overview.best.count - (overview.best.times.length - upcoming.length) - 1)
			: 0
	);
	const days = $derived(overview ? describeDays(overview) : '');
	const role = $derived(
		pulse?.role === 'owner' ? 'Owner' : pulse?.role === 'admin' ? 'Admin' : null
	);
	const opened = $derived(
		item.openedAt > 1_000_000_000_000
			? (DateTime.fromMillis(item.openedAt).toRelative({ style: 'short' }) ?? '')
			: ''
	);

	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

	/** Who a best time works for, and the meeting it's for. */
	const fit = (o: EventOverview, free: number) => {
		const within = o.group ? ` in ${o.group}` : '';
		const tier =
			o.best?.tier === 'everyone'
				? o.group
					? `Everyone${within}`
					: 'Everyone can make it'
				: `${o.best?.tier === 'required' ? 'All required' : 'One short'}${within} · ${free} of ${o.considered}`;
		const meeting = `${formatDuration(o.duration)}${o.perWeek > 1 ? ` ${perWeekPhrase(o.perWeek)}` : ''}`;
		return [tier, meeting, more ? `${more} more` : ''].filter(Boolean).join(' · ');
	};

	/** Why there's no best time to show. */
	const nothing = (o: EventOverview) => {
		if (!o.responses) return 'No responses yet';
		if (!o.considered) return 'Everyone is skipped';
		if (ended) return 'This poll has ended';
		if (o.best) return 'Its best times have passed';
		return o.group ? `Nothing fits ${o.group} yet` : 'Nothing fits everyone yet';
	};
</script>

<article
	class="card group relative flex flex-col p-4 outline-offset-2 transition-colors hover:border-line-strong has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-focus"
>
	<div class="flex items-start gap-2">
		<div class="min-w-0 flex-1">
			<h3 class="truncate text-15 font-semibold text-fg">
				<!-- The whole card opens the event; the remove button sits above the link. -->
				<a
					class="card-link outline-none after:absolute after:inset-0 after:rounded-xl"
					href="/?e={encodeURIComponent(item.id)}"
				>
					{item.title}
				</a>
			</h3>
			<p class="mt-0.5 truncate text-xs text-fg-3">
				{[days, opened && `Opened ${opened}`].filter(Boolean).join(' · ')}
			</p>
		</div>
		<button
			class="btn btn-ghost btn-sm btn-icon relative z-10 -mt-1 -mr-1.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
			onclick={onforget}
			aria-label="Remove {item.title} from recent events"
			title="Remove from recent"
		>
			<X class="size-3.5 pointer-coarse:size-4.5" />
		</button>
	</div>

	{#if overview}
		<div class="mt-3 {ended ? 'opacity-60' : ''}">
			<MiniHeatmap heat={overview.heat} label="When people are free, {days}" />
		</div>
		<div class="mt-3 flex items-start gap-2.5">
			{#if next}
				{@const when = describeTime(overview, next)}
				<CalendarCheck class="mt-0.5 size-4 shrink-0 text-accent-fg" aria-hidden="true" />
				<div class="min-w-0">
					<p class="text-13 font-medium text-fg">
						<span class="sr-only">Best time: </span>{when.day} · {when.time}
						{#if !overview.weekly && overview.zone !== localZone()}
							<span class="font-normal text-fg-3">({zonePlace(overview.zone)})</span>
						{/if}
					</p>
					<p class="mt-0.5 text-xs text-fg-2">{fit(overview, next.free)}</p>
				</div>
			{:else}
				<CalendarX class="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden="true" />
				<p class="text-13 text-fg-2">{nothing(overview)}</p>
			{/if}
		</div>
	{:else}
		<!-- Where the heatmap would be, so cards line up. -->
		<p
			class="mt-3 flex h-[4.5rem] items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-xs text-pretty text-fg-3"
		>
			Open it once more to see its heatmap and best time here.
		</p>
	{/if}

	{#if overview?.responded === false && !ended}
		<p class="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-warn">
			<PencilLine class="size-3.5 shrink-0" aria-hidden="true" />
			You haven't added your times
		</p>
	{/if}

	<div class="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-xs text-fg-2">
		<span class="mr-1 inline-flex items-center gap-1">
			<Users class="size-3.5 text-fg-3" aria-hidden="true" />
			{plural(people, 'person', 'people')}
		</span>
		{#if joined}
			<span class="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent-fg">
				{joined} new
			</span>
		{/if}
		{#if role}
			<span class="rounded-full bg-subtle px-2 py-0.5 text-11 font-medium">{role}</span>
		{/if}
		{#if !isNativeEventId(item.id)}
			<span class="ml-auto text-11 text-fg-3">When2Meet</span>
		{/if}
	</div>
</article>
