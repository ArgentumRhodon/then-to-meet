<script lang="ts">
	import { closeEvent } from '$lib/navigation';
	import { app } from '$lib/state/app.svelte';
	import { isTyping } from '$lib/ui/keys';
	import { layout } from '$lib/ui/layout.svelte';
	import SettingsMenu from '$lib/ui/SettingsMenu.svelte';
	import EventHeader from './main/EventHeader.svelte';
	import Heatmap from './main/Heatmap.svelte';
	import BestTimesPanel from './sidebar/BestTimesPanel.svelte';
	import EventSwitcher from './sidebar/EventSwitcher.svelte';
	import PeoplePanel from './sidebar/PeoplePanel.svelte';
	import RespondCard from './sidebar/RespondCard.svelte';

	/**
	 * Escape anywhere backs out a step: the one-person view, then a pinned best time or the picked
	 * times. A menu or text field that used the key first keeps it, and so does an open dialog,
	 * whose Escape closes it and nothing else.
	 */
	const onkeydown = (e: KeyboardEvent) => {
		if (e.key !== 'Escape' || e.defaultPrevented || isTyping(document.activeElement)) return;
		if (document.querySelector('dialog[open]')) return;
		const card = document.activeElement?.closest('[data-result]');
		const left = app.back();
		if (!left) return;
		e.preventDefault();
		// Unpinning folds the card away; keep focus on it rather than losing it with its details.
		if (left === 'selection') card?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
	};
</script>

<svelte:window {onkeydown} />

<!-- Past the event header and the people list, which can be long, to the answer. -->
<a
	href="#results"
	class="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
>
	Skip to results
</a>

<div class="workspace grid min-h-dvh lg:h-dvh lg:overflow-hidden">
	<!-- Above the sidebar (z-10) so its menus open over it. -->
	<div
		class="relative z-30 flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 [grid-area:brand] lg:h-auto lg:border-r"
	>
		<a
			href="/"
			class="flex h-10 items-center rounded-md text-15 font-semibold tracking-tight"
			onclick={(e) => {
				e.preventDefault();
				closeEvent();
			}}
			title="Back to start"
		>
			ThenToMeet
		</a>
		<div class="ml-auto flex items-center gap-1.5">
			<EventSwitcher />
			<!-- On narrow screens this bar is the top of the page, so the settings menu sits here; the
			     wide layout puts it in the event header. -->
			<div class="lg:hidden">
				<SettingsMenu />
			</div>
		</div>
	</div>

	<EventHeader class="[grid-area:header]" />

	<aside
		class="relative z-10 border-b border-line bg-panel [grid-area:side] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:shadow-[8px_0_24px_-12px_var(--shadow-tint)]"
		aria-label={layout.resultsInSide ? 'Best times and people' : 'People'}
	>
		<!-- ThenToMeet's own events are answered right here (When2Meet's on When2Meet). Responding is
		     what most visitors came to do, so it leads the people column. -->
		{#if app.event?.source === 'thentomeet'}
			<RespondCard />
		{/if}
		<!-- Too narrow for a column of its own: best times joins people, so the heatmap keeps the
		     whole main area. It goes first, since it's the answer, and a long people list would
		     otherwise push it out of sight. -->
		{#if layout.resultsInSide}
			<BestTimesPanel />
		{/if}
		<!-- Groups and filters belong to one event, so start fresh when the event changes. -->
		{#key app.event?.id}
			<!-- Without the heatmap, best times is the main view, so keep people folded away. -->
			<PeoplePanel startOpen={layout.showHeatmap} />
		{/key}
	</aside>

	<!-- The results, in reading order: the heatmap, then best times. Wide screens put them side by
	     side, each with its own scroll; narrow ones let the page flow. -->
	<!-- The page's main landmark at every width, heatmap or not: this is where the answer is. -->
	<main
		class="min-w-0 outline-none [grid-area:main] lg:overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_min(22rem,30vw)] xl:grid-rows-[minmax(0,1fr)]"
		id="results"
		tabindex="-1"
		aria-label="Results"
	>
		<!-- Too narrow for the grid to read well: best times covers it instead. -->
		{#if layout.showHeatmap}
			<section class="min-h-0 lg:flex lg:h-full lg:flex-col" aria-label="Availability heatmap">
				<Heatmap class="lg:flex-1" />
			</section>
		{/if}

		{#if !layout.resultsInSide}
			<div
				class="bg-panel xl:min-h-0 xl:overflow-y-auto {layout.showHeatmap
					? 'border-t border-line xl:border-t-0 xl:border-l'
					: ''}"
			>
				<BestTimesPanel />
			</div>
		{/if}
	</main>

	{#if app.status === 'loading'}
		<div
			class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-accent-soft"
			role="progressbar"
			aria-label="Loading event"
		>
			<div class="loading-bar h-full w-1/3 bg-accent"></div>
		</div>
	{/if}
</div>

<style>
	.workspace {
		grid-template-columns: minmax(0, 1fr);
		/* When everything is folded away and the page is shorter than the screen, the spare height
		   goes to the last row, not spread across the bars above it. */
		grid-template-rows: auto auto auto 1fr;
		grid-template-areas: 'brand' 'header' 'side' 'main';
	}
	@media (min-width: 64rem) {
		.workspace {
			/* Capped by the window too, so very large text can't squeeze the heatmap out. At the
			   default size it's 23rem from 1024px up. */
			grid-template-columns: min(23rem, 36vw) minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			grid-template-areas: 'brand header' 'side main';
		}
	}
	.loading-bar {
		animation: slide 1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
</style>
