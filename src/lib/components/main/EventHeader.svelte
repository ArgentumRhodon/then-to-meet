<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Import from '@lucide/svelte/icons/import';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import { DateTime } from 'luxon';
	import { formatDay } from '$lib/analysis/format';
	import { isImportableId } from '$lib/events/id';
	import { openEvent } from '$lib/navigation';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import SettingsMenu from '$lib/ui/SettingsMenu.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import { DEMO_ID, eventUrl } from '$lib/w2m/id';
	import ManageMenu from './ManageMenu.svelte';
	import ShareMenu from './ShareMenu.svelte';

	let { class: className = '' }: { class?: string } = $props();

	const event = $derived(app.event!);
	const zone = $derived(app.grid!.zone);

	// Events with no source are When2Meet's; an imported copy points back at its poll.
	const w2mId = $derived(event.importedFrom ?? (event.source === 'thentomeet' ? null : event.id));
	const canImport = $derived(
		accounts.enabled && event.source !== 'thentomeet' && isImportableId(event.id)
	);
	let importing = $state(false);

	/** Copies this When2Meet poll into the signed-in account (signing in first), then opens it. */
	const importEvent = async () => {
		if (importing) return;
		importing = true;
		try {
			if (!accounts.user && !(await accounts.signIn())) return;
			const copy = await accounts.importWhen2Meet(event);
			if (!copy) return;
			toast.show(copy.created ? 'Imported to ThenToMeet' : 'You already imported this one');
			await openEvent(copy.id);
		} finally {
			importing = false;
		}
	};

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

	/** When this page last pulled responses, by this device's clock (fetchedAt is the server's). */
	let lastPulled = Date.now();

	/** Pulls new responses. The button always reports back; a background check only speaks up. */
	const refresh = async ({ auto = false } = {}) => {
		lastPulled = Date.now();
		const fresh = await app.refresh({ auto });
		if (!fresh) return;
		const parts = [
			fresh.added.length &&
				`${fresh.added.length} new ${fresh.added.length === 1 ? 'response' : 'responses'}`,
			fresh.updated.length && `${fresh.updated.length} updated`
		].filter(Boolean);
		if (parts.length) toast.show(parts.join(', '));
		else if (!auto) toast.show('No new responses');
	};

	// Keep responses current while the page is open and visible: pull a minute after the last
	// pull, and on coming back to the tab after that long. The demo never changes, so skip it.
	const AUTO_REFRESH_MS = 60_000;
	const eventId = $derived(event.id);
	$effect(() => {
		// A live event pushes its own changes; the demo never changes.
		if (eventId === DEMO_ID || app.live) return;
		lastPulled = Date.now();
		const check = () => {
			if (document.visibilityState !== 'visible' || app.refreshing) return;
			if (Date.now() - lastPulled >= AUTO_REFRESH_MS) refresh({ auto: true });
		};
		const timer = setInterval(check, 15_000);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', check);
		};
	});
</script>

<header class="border-b border-line px-4 py-3 sm:px-6 {className}">
	<div class="flex flex-wrap items-start gap-x-4 gap-y-3">
		<div class="min-w-0 flex-1 basis-64">
			<div class="flex items-center gap-2">
				<h1 class="truncate text-lg font-semibold tracking-tight">{event.title}</h1>
				{#if event.id === DEMO_ID}
					<span
						class="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
						>Demo</span
					>
				{/if}
				<button
					class="btn btn-ghost btn-icon size-7 shrink-0"
					onclick={() => refresh()}
					disabled={app.refreshing}
					aria-label="Refresh responses"
					title="Pull the latest responses"
				>
					<RefreshCw class="size-4 pointer-coarse:size-5 {app.refreshing ? 'animate-spin' : ''}" />
				</button>
			</div>
			<p class="mt-0.5 text-[13px] text-fg-2 sm:truncate">
				{event.people.length}
				{event.people.length === 1 ? 'person' : 'people'} responded · {range}
				{#if event.weekly}· weekly{/if}
				{#if app.live}
					<span class="text-fg-3" title="New responses appear as they come in">
						· <span class="live-dot" aria-hidden="true"></span> live
					</span>
				{:else}
					<span class="text-fg-3">· updated {updated}</span>
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<ManageMenu />
			{#if canImport}
				<button
					class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
					onclick={importEvent}
					disabled={importing || accounts.busy}
					title="Copy this poll into your ThenToMeet account"
				>
					<Import class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
					Import
				</button>
			{/if}
			{#if event.id !== DEMO_ID && w2mId}
				<a
					class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
					href={eventUrl(w2mId)}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="W2M: open in When2Meet"
					title="Open in When2Meet"
				>
					<ExternalLink class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
					W2M
				</a>
			{/if}
			<ShareMenu />
			<!-- Narrow screens keep it at the end of the top bar, where there's room (see Workspace). -->
			<div class="hidden lg:block">
				<SettingsMenu />
			</div>
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
				class="-my-1 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded hover:bg-danger/10 pointer-coarse:-my-2 pointer-coarse:size-9"
				onclick={() => (app.error = null)}
				aria-label="Dismiss"
			>
				<X class="size-3.5 pointer-coarse:size-4.5" />
			</button>
		</div>
	{/if}
</header>

<style>
	.live-dot {
		display: inline-block;
		width: 0.4rem;
		height: 0.4rem;
		margin-right: 0.15rem;
		border-radius: 9999px;
		background: var(--ok);
		vertical-align: middle;
	}
	@media (prefers-reduced-motion: no-preference) {
		.live-dot {
			animation: live-pulse 2.4s ease-in-out infinite;
		}
	}
	@keyframes live-pulse {
		50% {
			opacity: 0.35;
		}
	}
</style>
