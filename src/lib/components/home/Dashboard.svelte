<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Plus from '@lucide/svelte/icons/plus';
	import { DateTime } from 'luxon';
	import { tick } from 'svelte';
	import { formatDateSpan, hasEnded } from '$lib/analysis/overview';
	import type { EventSummary } from '$lib/events/model';
	import { openEvent } from '$lib/navigation';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app, localZone } from '$lib/state/app.svelte';
	import { dashboard } from '$lib/state/dashboard.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import LinkInput from '../LinkInput.svelte';
	import EventCard from './EventCard.svelte';

	/** Cards shown before "Show all". */
	const SHOWN = 6;

	let showAll = $state(false);
	/** One moment for every card, so they agree on what has passed. */
	const now = Date.now() / 1000;

	const cards = $derived(showAll ? recent.items : recent.items.slice(0, SHOWN));
	/** The account's events that aren't already a card. */
	const others = $derived(
		dashboard.yours.filter((e) => !recent.items.some((item) => item.id === e.id))
	);
	/** Signed in and still reading: placeholders keep the page from jumping when cards arrive. */
	const pending = $derived(
		!!accounts.user && !recent.items.length && (recent.loading || dashboard.loading)
	);

	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

	/** What needs a look, across every recent event. */
	const status = $derived.by(() => {
		let joined = 0;
		let waiting = 0;
		for (const item of recent.items) {
			const pulse = recent.pulses[item.id];
			const overview = item.overview;
			if (!overview) continue;
			if (pulse && pulse.responseCount > overview.responses) joined++;
			if (overview.responded === false && !hasEnded(overview, now)) waiting++;
		}
		const parts = [
			joined && `${plural(joined, 'event has', 'events have')} new responses`,
			waiting && `${plural(waiting, 'event is', 'events are')} waiting for your times`
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : 'Pick up where you left off, or open another poll.';
	});

	/** Takes an event off the list, then focuses the card that took its place (or the one before). */
	let grid = $state<HTMLElement>();
	const forget = async (id: string, index: number) => {
		recent.forget(id);
		await tick();
		const left = grid?.querySelectorAll<HTMLElement>('.card-link');
		(
			left?.[index] ??
			left?.[index - 1] ??
			document.querySelector<HTMLElement>('input[inputmode="url"]')
		)?.focus();
	};

	const role = (e: EventSummary) =>
		e.role === 'owner' ? 'Owner' : e.role === 'admin' ? 'Admin' : 'Responded';
	const span = (e: EventSummary) =>
		e.weekly ? 'Weekly' : e.start ? formatDateSpan(e.start, e.end, localZone()) : '';
	const active = (e: EventSummary) =>
		DateTime.fromMillis(e.updatedAt).toRelative({ style: 'short' }) ?? '';
</script>

<main class="mx-auto w-full max-w-5xl flex-1 px-5 pt-4 pb-16 sm:pt-8">
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold tracking-tight">Your events</h1>
			<p class="mt-1 text-sm text-pretty text-fg-2" aria-live="polite">
				{pending ? 'Loading your events…' : status}
			</p>
		</div>
		{#if accounts.enabled}
			<a class="btn btn-primary" href="/new">
				<Plus class="size-4 pointer-coarse:size-5" aria-hidden="true" />
				New event
			</a>
		{/if}
	</div>

	<div class="mt-5 max-w-xl">
		<LinkInput autofocus onsubmit={openEvent} />
		{#if app.error}
			<div
				class="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger"
				role="alert"
			>
				<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>{app.error}</span>
			</div>
		{/if}
	</div>

	<section class="mt-10" aria-labelledby="recent-heading" aria-busy={pending}>
		<h2 id="recent-heading" class="eyebrow mb-3 text-fg-2">Recent</h2>

		{#if accounts.enabled && accounts.resolved && !accounts.user && recent.items.length}
			<div
				class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-accent-soft px-4 py-3"
			>
				<p class="text-13 text-pretty text-accent-fg">
					This list only lasts for this visit. Sign in to keep your events, their setup, and these
					overviews.
				</p>
				<button
					class="btn btn-secondary btn-sm"
					disabled={accounts.busy}
					onclick={() => accounts.signIn()}
				>
					<LogIn class="size-3.5" aria-hidden="true" />
					Sign in
				</button>
			</div>
		{/if}

		{#if pending}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
				{#each [0, 1, 2] as i (i)}
					<div class="card animate-pulse space-y-3 p-4">
						<div class="h-4 w-2/3 rounded bg-subtle"></div>
						<div class="h-3 w-1/2 rounded bg-subtle"></div>
						<div class="h-[4.5rem] rounded-lg bg-subtle"></div>
						<div class="h-3 w-3/4 rounded bg-subtle"></div>
					</div>
				{/each}
			</div>
		{:else if recent.items.length}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" bind:this={grid}>
				{#each cards as item, index (item.id)}
					<EventCard
						{item}
						pulse={recent.pulses[item.id]}
						{now}
						onforget={() => forget(item.id, index)}
					/>
				{/each}
			</div>
			{#if recent.items.length > SHOWN}
				<button
					class="btn btn-ghost btn-sm mt-3"
					onclick={() => (showAll = !showAll)}
					aria-expanded={showAll}
				>
					{showAll ? 'Show fewer' : `Show all ${recent.items.length}`}
				</button>
			{/if}
		{:else}
			<p class="text-sm text-fg-2">Events you open show up here.</p>
		{/if}
	</section>

	{#if others.length}
		<section class="mt-10" aria-labelledby="others-heading">
			<h2 id="others-heading" class="eyebrow mb-3 text-fg-2">More of your events</h2>
			<ul class="card grid gap-0.5 p-1.5 sm:grid-cols-2">
				{#each others as event (event.id)}
					<li>
						<a
							class="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle"
							href="/?e={encodeURIComponent(event.id)}"
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-fg">{event.title}</span>
								<span class="block truncate text-xs text-fg-3">
									{[
										span(event),
										plural(event.responseCount, 'person', 'people'),
										hasEnded(event, now) ? 'Ended' : '',
										`active ${active(event)}`
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</span>
							<span
								class="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-11 font-medium text-fg-2"
							>
								{role(event)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
