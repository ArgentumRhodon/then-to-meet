<script lang="ts">
	import { closeEvent } from '$lib/navigation';
	import { app } from '$lib/state/app.svelte';
	import { isTyping } from '$lib/ui/keys';
	import { layout } from '$lib/ui/layout.svelte';
	import ThemeMenu from '$lib/ui/ThemeMenu.svelte';
	import EventHeader from './main/EventHeader.svelte';
	import Heatmap from './main/Heatmap.svelte';
	import BestTimesPanel from './sidebar/BestTimesPanel.svelte';
	import EventSwitcher from './sidebar/EventSwitcher.svelte';
	import PeoplePanel from './sidebar/PeoplePanel.svelte';

	/**
	 * Escape anywhere backs out a step: the one-person view, then a pinned best time or the picked
	 * times. A menu or text field that used the key first keeps it.
	 */
	const onkeydown = (e: KeyboardEvent) => {
		if (e.key !== 'Escape' || e.defaultPrevented || isTyping(document.activeElement)) return;
		const card = document.activeElement?.closest('[data-result]');
		const left = app.back();
		if (!left) return;
		e.preventDefault();
		// Unpinning folds the card away; keep focus on it rather than losing it with its details.
		if (left === 'selection') card?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
	};
</script>

<svelte:window {onkeydown} />

<div class="workspace grid min-h-dvh lg:h-dvh lg:overflow-hidden">
	<!-- Above the sidebar (z-10) so its menus open over it. -->
	<div
		class="relative z-30 flex h-14 items-center gap-2 border-b border-line bg-panel px-4 [grid-area:brand] lg:h-auto lg:border-r"
	>
		<a
			href="/"
			class="flex h-10 items-center rounded-md text-[15px] font-semibold tracking-tight"
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
			<!-- On narrow screens this bar is the top of the page, so the theme menu sits here; the
			     wide layout puts it in the event header, left of the timezone. -->
			<div class="lg:hidden">
				<ThemeMenu />
			</div>
		</div>
	</div>

	<EventHeader class="[grid-area:header]" />

	<aside
		class="relative z-10 border-b border-line bg-panel [grid-area:side] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:shadow-[8px_0_24px_-12px_var(--shadow-tint)]"
		aria-label="People and best times"
	>
		<!-- Groups and filters belong to one event, so start fresh when the event changes. -->
		{#key app.event?.id}
			<!-- Without the heatmap, best times is the main view, so keep people folded away. -->
			<PeoplePanel startOpen={layout.showHeatmap} />
		{/key}
		<BestTimesPanel />
	</aside>

	<!-- Too narrow for the grid to read well: best times covers it instead. -->
	{#if layout.showHeatmap}
		<main class="min-h-0 [grid-area:grid] lg:flex lg:flex-col" aria-label="Availability heatmap">
			<Heatmap class="lg:flex-1" />
		</main>
	{/if}

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
		grid-template-areas: 'brand' 'header' 'side' 'grid';
	}
	@media (min-width: 64rem) {
		.workspace {
			grid-template-columns: 23rem minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			grid-template-areas: 'brand header' 'side grid';
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
