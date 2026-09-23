<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import { DateTime } from 'luxon';
	import { formatDay } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { DEMO_ID, eventUrl } from '$lib/w2m/id';
	import ShareMenu from './ShareMenu.svelte';
	import TimezonePicker from './TimezonePicker.svelte';

	let { class: className = '' }: { class?: string } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);

	const range = $derived.by(() => {
		const first = event.slots[0].time;
		const last = event.slots[event.slots.length - 1].time;
		const days = app.grid!.days;
		if (event.weekly) {
			return days.length > 1
				? `${days[0].weekday} – ${days[days.length - 1].weekday}`
				: days[0].weekday;
		}
		return days.length > 1
			? `${formatDay(first, zone, false)} – ${formatDay(last, zone, false)}`
			: formatDay(first, zone, false);
	});

	// Re-render the "updated" label every 30s so it stays honest.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
	const updated = $derived(
		now - event.fetchedAt < 45_000
			? 'just now'
			: DateTime.fromMillis(event.fetchedAt).toRelative({ base: DateTime.fromMillis(now) })
	);
</script>

<header class="border-b border-line px-4 py-3 sm:px-6 {className}">
	<div class="flex flex-wrap items-start gap-x-4 gap-y-3">
		<div class="min-w-0 flex-1 basis-64">
			<div class="flex items-center gap-2">
				<h1 class="truncate text-lg font-semibold tracking-tight">{event.title}</h1>
				{#if event.id === DEMO_ID}
					<span class="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
						>Demo</span
					>
				{/if}
			</div>
			<p class="mt-0.5 text-[13px] text-fg-2 sm:truncate">
				{event.people.length}
				{event.people.length === 1 ? 'person' : 'people'} responded · {range}
				{#if event.weekly}· weekly{/if}
				<span class="text-fg-3">· updated {updated}</span>
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<TimezonePicker />
			<button
				class="btn btn-ghost btn-icon size-8"
				onclick={() => app.refresh()}
				disabled={app.refreshing}
				aria-label="Refresh responses"
				title="Pull the latest responses"
			>
				<RefreshCw class="size-4 {app.refreshing ? 'animate-spin' : ''}" />
			</button>
			{#if event.id !== DEMO_ID}
				<a
					class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
					href={eventUrl(event.id)}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Open in When2Meet"
					title="Open in When2Meet"
				>
					<ExternalLink class="size-3.5 text-fg-2" aria-hidden="true" />
					W2M
				</a>
			{/if}
			<ShareMenu />
		</div>
	</div>

	{#if app.error}
		<div
			class="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
			role="alert"
		>
			<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span class="flex-1">{app.error}</span>
			<button
				class="-my-0.5 rounded p-0.5 hover:bg-danger/10"
				onclick={() => (app.error = null)}
				aria-label="Dismiss"
			>
				<X class="size-3.5" />
			</button>
		</div>
	{/if}
</header>
