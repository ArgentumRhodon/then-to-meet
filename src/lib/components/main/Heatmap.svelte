<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { formatDay, formatMinuteOfDay, formatTimeRange } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { heatColor, heatMix as mix } from '$lib/ui/heat';
	import HeatPaletteMenu from '$lib/ui/HeatPaletteMenu.svelte';
	import SlotTooltip from './SlotTooltip.svelte';

	let { class: className = '' }: { class?: string } = $props();

	const event = $derived(app.event!);
	const grid = $derived(app.grid!);
	const free = $derived(event.slots.map((slot) => new Set(slot.available)));
	const spotlightName = $derived(event.people.find((p) => p.id === app.spotlight)?.name ?? null);

	/** CSS grid line for each row, with a thin spacer row wherever the day has a gap. */
	const layout = $derived.by(() => {
		const line: number[] = [];
		const template = ['auto'];
		let next = 2;
		grid.rows.forEach((row, i) => {
			if (row.gapBefore) {
				template.push('0.75rem');
				next++;
			}
			template.push('var(--row)');
			line[i] = next++;
		});
		return { line, template: template.join(' ') };
	});

	/** Where each slot sits: grid day and row index. */
	const position = $derived.by(() => {
		const rowOf = new Map(grid.rows.map((r, i) => [r.minute, i]));
		const pos: { day: number; row: number }[] = [];
		grid.days.forEach((day, d) =>
			day.slotByMinute.forEach((slot, minute) => (pos[slot] = { day: d, row: rowOf.get(minute)! }))
		);
		return pos;
	});

	const rowHeight = $derived(grid.rows.length > 64 ? 14 : grid.rows.length > 40 ? 16 : 20);

	const heat = (slot: number): string => {
		if (app.spotlight !== null) return free[slot].has(app.spotlight) ? mix(80) : 'var(--heat-0)';
		return heatColor(app.attendance!.counts[slot], app.attendance!.total);
	};

	const legendSteps = $derived.by(() => {
		const steps = Math.min(app.attendance?.total ?? 0, 6);
		return Array.from({ length: steps + 1 }, (_, i) => heatColor(i, steps));
	});

	const active = $derived(app.activeBlock);
	const pinned = $derived(app.pinnedBlock);
	const activePos = $derived(
		active && position[active.startSlot] && position[active.endSlot]
			? { start: position[active.startSlot], end: position[active.endSlot] }
			: null
	);
	const inPinned = (slot: number) => !!pinned && slot >= pinned.startSlot && slot <= pinned.endSlot;

	// Tooltip placement, anchored to the hovered (or keyboard-focused) cell.
	let scroller: HTMLDivElement;
	let gridEl: HTMLDivElement;
	let outline = $state<HTMLDivElement>();
	/** True when the grid took focus because the mouse moved over it, not from Tab. */
	let pointerFocused = $state(false);
	let tipRect = $state<DOMRect | null>(null);
	let tipHeight = $state(0);
	let viewport = $state({ w: 1024, h: 768 });

	const tipStyle = $derived.by(() => {
		if (!tipRect) return '';
		const width = 256;
		let left = tipRect.right + 10;
		if (left + width > viewport.w - 8) left = tipRect.left - 10 - width;
		left = Math.max(8, left);
		const top = Math.min(Math.max(8, tipRect.top - 12), viewport.h - tipHeight - 8);
		return `left:${left}px;top:${top}px`;
	});

	const showTip = (slot: number, el: Element) => {
		app.hoveredSlot = slot;
		tipRect = el.getBoundingClientRect();
		viewport = { w: window.innerWidth, h: window.innerHeight };
	};

	const hideTip = () => {
		app.hoveredSlot = null;
		tipRect = null;
	};

	const isTyping = (el: Element | null) =>
		el instanceof HTMLInputElement ||
		el instanceof HTMLTextAreaElement ||
		el instanceof HTMLSelectElement ||
		(el instanceof HTMLElement && el.isContentEditable);

	const onpointerover = (e: PointerEvent) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
		if (!el) return;
		showTip(Number(el.dataset.slot), el);
		// Take focus on hover so the arrow keys work right away, unless someone is mid-typing.
		if (
			e.pointerType === 'mouse' &&
			document.activeElement !== gridEl &&
			!isTyping(document.activeElement)
		) {
			pointerFocused = true;
			gridEl.focus({ preventScroll: true });
		}
	};

	const onpointerleave = (e: PointerEvent) => {
		// On touch, keep the tooltip up after the finger lifts; the next tap moves or clears it.
		if (e.pointerType === 'touch') return;
		hideTip();
		// Hand focus back so the arrow keys scroll the page again.
		if (pointerFocused && document.activeElement === gridEl) gridEl.blur();
	};

	const focusSlot = async (slot: number) => {
		await tick();
		const el = scroller.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
		if (!el) return;
		el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		showTip(slot, el);
	};

	const onkeydown = (e: KeyboardEvent) => {
		const moves: Record<string, [number, number]> = {
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0]
		};
		if (e.key === 'Escape') return hideTip();
		const move = moves[e.key];
		if (!move) return;
		e.preventDefault();
		const current = app.hoveredSlot !== null ? position[app.hoveredSlot] : null;
		if (!current) return focusSlot(grid.days[0].slotByMinute.values().next().value!);

		let { day, row } = current;
		// Step until we land on a real slot, skipping blank cells.
		for (;;) {
			day += move[0];
			row += move[1];
			if (day < 0 || day >= grid.days.length || row < 0 || row >= grid.rows.length) return;
			const slot = grid.days[day].slotByMinute.get(grid.rows[row].minute);
			if (slot !== undefined) return focusSlot(slot);
		}
	};

	// Bring a block into view when it's picked in the sidebar.
	$effect(() => {
		if (!pinned) return;
		tick().then(() =>
			outline?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
		);
	});

	const hovered = $derived(app.hoveredSlot);
	const liveLabel = $derived.by(() => {
		if (hovered === null || !app.attendance) return '';
		const t = event.slots[hovered].time;
		return `${formatDay(t, grid.zone, event.weekly)}, ${formatTimeRange(t, t + event.slotSeconds, grid.zone)}: ${app.attendance.counts[hovered]} of ${app.attendance.total} available`;
	});
</script>

<svelte:window onblur={hideTip} />

<!-- Always dark: color ramps read far better on a dark ground. In the light theme it sits in the
     page as a framed panel. -->
<div
	class="flex min-h-0 flex-col bg-page scheme-dark light:m-3 light:overflow-hidden light:rounded-2xl light:shadow-[0_12px_32px_-14px_rgb(14_42_53/0.45)] light:sm:m-4 {className}"
>
	<div
		class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-fg-2 sm:px-6"
	>
		{#if spotlightName}
			<span class="flex items-center gap-2">
				<span class="size-3 rounded-sm" style:background={mix(80)}></span>
				Showing only <strong class="font-semibold text-fg">{spotlightName}</strong>’s availability
			</span>
			{#if app.pinnedPerson !== null}
				<button class="btn btn-ghost btn-sm -my-1" onclick={() => (app.pinnedPerson = null)}>
					<X class="size-3.5" aria-hidden="true" /> Clear
				</button>
			{/if}
		{:else}
			<span class="flex items-center gap-2">
				<span>0</span>
				<span class="flex gap-0.5" aria-hidden="true">
					{#each legendSteps as color, i (i)}
						<span class="h-3 w-4 rounded-sm first:rounded-l last:rounded-r" style:background={color}
						></span>
					{/each}
				</span>
				<span class="tabular">{app.attendance?.total ?? 0} available</span>
			</span>
			<span class="hidden text-fg-3 sm:inline"
				>Hover a cell for details, or use the arrow keys.</span
			>
		{/if}
		<div class="ml-auto">
			<HeatPaletteMenu />
		</div>
	</div>

	<!-- isolate keeps the sticky headers' z-index inside the grid, below the app's menus. -->
	<div
		bind:this={scroller}
		class="relative isolate max-h-[75dvh] min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-6 sm:px-6 lg:max-h-none"
		onscroll={() => tipRect && hideTip()}
	>
		<!-- Focusable so arrow keys can walk the slots; the live region announces each one. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={gridEl}
			class="heatmap relative grid"
			class:dimmed={!!pinned}
			class:pointer-focused={pointerFocused}
			style:--row="{rowHeight}px"
			style:grid-template-columns="3.25rem repeat({grid.days.length}, minmax(2.75rem, 1fr))"
			style:grid-template-rows={layout.template}
			style:max-width="{3.25 + grid.days.length * 10}rem"
			role="group"
			aria-label="Availability by day and time. Use arrow keys to move between time slots."
			aria-describedby="heatmap-live"
			tabindex="0"
			{onpointerover}
			{onpointerleave}
			{onkeydown}
			onfocusout={() => {
				hideTip();
				pointerFocused = false;
			}}
		>
			<div
				class="corner sticky top-0 left-0 z-20 bg-page"
				style:grid-row="1"
				style:grid-column="1"
			></div>
			{#each grid.days as day, d (day.key)}
				<div
					class="sticky top-0 z-10 bg-page pt-1 pb-2 text-center"
					style:grid-row="1"
					style:grid-column={d + 2}
				>
					<div class="text-[11px] font-medium text-fg-3 uppercase">{day.weekday}</div>
					{#if day.date}
						<div class="text-[13px] font-semibold text-fg tabular">
							<span class="sm:hidden">{day.dayOfMonth}</span>
							<span class="hidden sm:inline">{day.date}</span>
						</div>
					{/if}
				</div>
			{/each}

			{#each grid.rows as row, i (row.minute)}
				{#if row.hour || i === 0 || row.gapBefore}
					<div
						class="sticky left-0 z-[5] bg-page pr-2 text-right text-[11px] leading-none text-fg-3 tabular"
						style:grid-row={layout.line[i]}
						style:grid-column="1"
					>
						<span class="relative {i === 0 || row.gapBefore ? 'top-0' : '-top-[0.4em]'}">
							{formatMinuteOfDay(row.minute)}
						</span>
					</div>
				{/if}
			{/each}

			{#each grid.days as day, d (day.key)}
				{#each grid.rows as row, i (row.minute)}
					{@const slot = day.slotByMinute.get(row.minute)}
					{@const segStart = i === 0 || row.gapBefore}
					{@const segEnd = i === grid.rows.length - 1 || grid.rows[i + 1].gapBefore}
					{#if slot === undefined}
						<div
							class="cell empty"
							class:seg-start={segStart}
							class:seg-end={segEnd}
							style:grid-row={layout.line[i]}
							style:grid-column={d + 2}
						></div>
					{:else}
						<div
							class="cell"
							class:hour={row.hour && !segStart}
							class:half={!row.hour && row.minute % 30 === 0 && !segStart}
							class:seg-start={segStart}
							class:seg-end={segEnd}
							class:in-pinned={inPinned(slot)}
							class:hovered={hovered === slot}
							data-slot={slot}
							style:grid-row={layout.line[i]}
							style:grid-column={d + 2}
							style:background={heat(slot)}
						></div>
					{/if}
				{/each}
			{/each}

			{#if active && activePos}
				<div
					bind:this={outline}
					class="block-outline {active === pinned ? 'is-pinned' : ''}"
					style:grid-column={activePos.start.day + 2}
					style:grid-row="{layout.line[activePos.start.row]} / {layout.line[activePos.end.row] + 1}"
				></div>
			{/if}
		</div>
	</div>
</div>

<p id="heatmap-live" class="sr-only" aria-live="polite">{liveLabel}</p>

{#if tipRect && hovered !== null}
	<div
		class="popover pointer-events-none fixed z-40 scheme-dark"
		style={tipStyle}
		bind:clientHeight={tipHeight}
		role="tooltip"
	>
		<SlotTooltip slot={hovered} />
	</div>
{/if}

<style>
	.heatmap {
		column-gap: 4px;
		min-width: max-content;
	}
	@media (min-width: 640px) {
		.heatmap {
			min-width: 0;
		}
	}
	.heatmap:focus-visible {
		outline-offset: 4px;
		border-radius: 8px;
	}
	/* Hover focus is invisible; the hovered cell's ring already shows where the keys start. */
	.heatmap.pointer-focused:focus-visible {
		outline: none;
	}
	.cell {
		position: relative;
		transition: opacity 150ms;
	}
	.cell.seg-start {
		border-top-left-radius: 6px;
		border-top-right-radius: 6px;
	}
	.cell.seg-end {
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}
	/* Hour and half-hour rules, cut in the page color so they read in both themes. */
	.cell.hour {
		box-shadow: inset 0 1px 0 var(--canvas);
	}
	.cell.half {
		box-shadow: inset 0 1px 0 color-mix(in oklab, var(--canvas) 45%, transparent);
	}
	.cell.empty {
		background: repeating-linear-gradient(
			135deg,
			transparent 0 4px,
			color-mix(in oklab, var(--line) 70%, transparent) 4px 5px
		);
	}
	.cell.hovered {
		box-shadow: inset 0 0 0 2px var(--fg);
		z-index: 1;
	}
	.dimmed .cell:not(.in-pinned):not(.empty) {
		opacity: 0.45;
	}
	.block-outline {
		pointer-events: none;
		z-index: 2;
		border-radius: 6px;
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 4px var(--canvas);
		opacity: 0.55;
	}
	.block-outline.is-pinned {
		opacity: 1;
	}
</style>
