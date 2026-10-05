<script lang="ts">
	import Paintbrush from '@lucide/svelte/icons/paintbrush';
	import { formatMinuteOfDay } from '$lib/analysis/format';
	import type { Grid } from '$lib/analysis/grid';

	let {
		grid,
		selected,
		onchange
	}: {
		grid: Grid;
		/** Indexes into the event's slots. */
		selected: ReadonlySet<number>;
		onchange: (next: Set<number>) => void;
	} = $props();

	let gridEl = $state<HTMLElement>();
	/** What a drag is doing: turning cells on or off, decided by the first cell it touched. */
	let mode: 'add' | 'remove' | null = null;
	/** The cell the arrow keys are on, as a position in the grid. */
	let cursor = $state<{ day: number; row: number } | null>(null);

	const set = (slots: number[], on: boolean) => {
		const next = new Set(selected);
		for (const slot of slots) {
			if (on) next.add(slot);
			else next.delete(slot);
		}
		onchange(next);
	};

	const slotsOfDay = (day: number): number[] => [...grid.days[day].slotByMinute.values()];

	const slotsOfHour = (hour: number): number[] =>
		grid.days.flatMap((d) =>
			[...d.slotByMinute].filter(([minute]) => Math.floor(minute / 60) === hour).map(([, s]) => s)
		);

	const allOn = (slots: number[]) => slots.length > 0 && slots.every((s) => selected.has(s));

	/** Turns every slot of a day or hour on, or off if they all already are. */
	const toggleGroup = (slots: number[]) => set(slots, !allOn(slots));

	/** Where each slot sits in the grid, as a day column and a time row. */
	const position = $derived.by(() => {
		const at = new Map<number, { day: number; row: number }>();
		grid.days.forEach((day, d) =>
			grid.rows.forEach((row, i) => {
				const slot = day.slotByMinute.get(row.minute);
				if (slot !== undefined) at.set(slot, { day: d, row: i });
			})
		);
		return at;
	});

	const cellAt = (x: number, y: number): number | null => {
		const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
		return cell ? Number(cell.dataset.slot) : null;
	};

	/** A drag marks the rectangle between the cell it started on and the one it's over. */
	let drag: { anchor: number; base: ReadonlySet<number> } | null = null;

	const stretchTo = (slot: number) => {
		if (!drag || mode === null) return;
		const from = position.get(drag.anchor)!;
		const to = position.get(slot)!;
		const next = new Set(drag.base);
		for (let d = Math.min(from.day, to.day); d <= Math.max(from.day, to.day); d++) {
			for (let i = Math.min(from.row, to.row); i <= Math.max(from.row, to.row); i++) {
				const inside = grid.days[d].slotByMinute.get(grid.rows[i].minute);
				if (inside === undefined) continue;
				if (mode === 'add') next.add(inside);
				else next.delete(inside);
			}
		}
		onchange(next);
	};

	/**
	 * Touch painting is opt-in: a finger on the grid has to be able to scroll the page and the
	 * grid, so unless this is on, touch only taps single cells.
	 */
	let painting = $state(false);
	/** A touch that might turn out to be a tap; it becomes a scroll if the finger moves. */
	let tap: { id: number; slot: number; x: number; y: number } | null = null;
	const TAP_SLOP = 8;

	const onpointerdown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const slot = cellAt(e.clientX, e.clientY);
		if (slot === null) return;
		if (e.pointerType === 'touch' && !painting) {
			// Marking waits for the finger to lift, so starting a scroll on a cell doesn't mark it.
			tap = { id: e.pointerId, slot, x: e.clientX, y: e.clientY };
			return;
		}
		// The first cell decides whether the drag marks or clears.
		mode = selected.has(slot) ? 'remove' : 'add';
		drag = { anchor: slot, base: selected };
		stretchTo(slot);
		gridEl?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};

	const onpointermove = (e: PointerEvent) => {
		if (tap?.id === e.pointerId) {
			if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = null;
			return;
		}
		if (!drag) return;
		const slot = cellAt(e.clientX, e.clientY);
		if (slot !== null) stretchTo(slot);
	};

	const end = () => {
		mode = null;
		drag = null;
	};

	const onpointerup = (e: PointerEvent) => {
		if (tap?.id === e.pointerId) {
			const { slot } = tap;
			tap = null;
			if (cellAt(e.clientX, e.clientY) === slot) set([slot], !selected.has(slot));
			return;
		}
		end();
	};

	const onpointercancel = () => {
		tap = null;
		end();
	};

	/** Arrow keys walk the cells, Space or Enter turns one on or off. */
	const onkeydown = (e: KeyboardEvent) => {
		const at = cursor ?? { day: 0, row: 0 };
		const step: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		if (e.key in step) {
			e.preventDefault();
			const [dx, dy] = step[e.key];
			cursor = {
				day: Math.min(Math.max(at.day + dx, 0), grid.days.length - 1),
				row: Math.min(Math.max(at.row + dy, 0), grid.rows.length - 1)
			};
		} else if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			const slot = grid.days[at.day].slotByMinute.get(grid.rows[at.row].minute);
			if (slot !== undefined) set([slot], !selected.has(slot));
		}
	};
</script>

<!-- Only where a touch screen is present; with a mouse, dragging always paints. -->
<div class="touch-only mb-2 items-center gap-3">
	<button
		type="button"
		class="btn btn-secondary btn-sm shrink-0 aria-pressed:border-accent aria-pressed:bg-accent-soft"
		aria-pressed={painting}
		onclick={() => (painting = !painting)}
	>
		<Paintbrush class="size-3.5" aria-hidden="true" />
		Drag to paint
	</button>
	<p class="text-xs text-fg-3" aria-live="polite">
		{painting
			? 'Drag over times to mark them. Turn this off to scroll.'
			: 'Tap times to mark them, or turn on Drag to paint.'}
	</p>
</div>

<div class="overflow-x-auto">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={gridEl}
		class="picker grid"
		class:painting
		style:grid-template-columns="3rem repeat({grid.days.length}, minmax(2.75rem, 1fr))"
		style:max-width="{3 + grid.days.length * 9}rem"
		role="grid"
		aria-label="Your availability. Use arrow keys to move between time slots and Space to mark or clear one."
		tabindex="0"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onpointercancel}
		onfocus={() => (cursor ??= { day: 0, row: 0 })}
		onblur={() => (cursor = null)}
		{onkeydown}
	>
		<div></div>
		{#each grid.days as day, d (day.key)}
			<button
				type="button"
				class="day-head rounded-md pt-1 pb-1.5 text-center hover:bg-subtle"
				onclick={() => toggleGroup(slotsOfDay(d))}
				tabindex="-1"
				aria-label="{day.date ?? day.weekday}: mark or clear the whole day"
			>
				<span class="block text-[11px] font-medium text-fg-3 uppercase">{day.weekday}</span>
				{#if day.date}
					<span class="block text-[13px] font-semibold text-fg tabular">
						<span class="sm:hidden">{day.dayOfMonth}</span>
						<span class="hidden sm:inline">{day.date}</span>
					</span>
				{/if}
			</button>
		{/each}

		{#each grid.rows as row, i (row.minute)}
			<div class="label" style:grid-row={i + 2} style:grid-column="1">
				{#if row.hour || i === 0 || row.gapBefore}
					<button
						type="button"
						class="w-full pr-2 text-right text-[11px] leading-none text-fg-3 tabular hover:text-fg"
						onclick={() => toggleGroup(slotsOfHour(Math.floor(row.minute / 60)))}
						tabindex="-1"
						aria-label="{formatMinuteOfDay(
							Math.floor(row.minute / 60) * 60
						)}: mark or clear the hour"
					>
						{formatMinuteOfDay(row.minute)}
					</button>
				{/if}
			</div>
			{#each grid.days as day, d (day.key)}
				{@const slot = day.slotByMinute.get(row.minute)}
				{#if slot === undefined}
					<div class="cell empty" style:grid-row={i + 2} style:grid-column={d + 2}></div>
				{:else}
					<div
						class="cell"
						class:on={selected.has(slot)}
						class:hour={row.hour && i > 0}
						class:cursor={cursor?.day === d && cursor?.row === i}
						role="gridcell"
						aria-selected={selected.has(slot)}
						data-slot={slot}
						style:grid-row={i + 2}
						style:grid-column={d + 2}
					></div>
				{/if}
			{/each}
		{/each}
	</div>
</div>

<style>
	.picker {
		column-gap: 3px;
		row-gap: 2px;
		min-width: max-content;
		user-select: none;
		-webkit-user-select: none;
	}
	@media (min-width: 640px) {
		.picker {
			min-width: 0;
		}
	}
	.picker:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
		border-radius: 8px;
	}
	.picker {
		--cell-height: 1.25rem;
	}
	/* Fingers are less exact than a mouse, so the cells grow. */
	@media (pointer: coarse) {
		.picker {
			--cell-height: 1.75rem;
		}
	}
	.touch-only {
		display: none;
	}
	@media (any-pointer: coarse) {
		.touch-only {
			display: flex;
		}
	}
	/* A touch scrolls the page and the grid, and marks a single cell on a tap. Only the paint mode
	   gives the grid the finger, so dragging marks instead of scrolling. */
	.cell {
		touch-action: manipulation;
		-webkit-touch-callout: none;
	}
	.picker.painting .cell {
		touch-action: none;
	}
	.cell {
		height: var(--cell-height);
		background: color-mix(in oklab, var(--fg) 9%, transparent);
		transition: background-color 80ms;
	}
	.cell.hour {
		box-shadow: 0 -1px 0 var(--line-strong);
	}
	.cell.empty {
		background: transparent;
	}
	/* Hover only where there is a pointer to hover with, or a tapped cell would stay lit. */
	@media (hover: hover) {
		.cell:not(.empty):hover {
			background: color-mix(in oklab, var(--accent) 35%, transparent);
		}
	}
	.cell.on {
		background: var(--accent);
	}
	@media (hover: hover) {
		.cell.on:hover {
			background: var(--accent-hover);
		}
	}
	.picker:focus-visible .cell.cursor {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}
	.label {
		height: var(--cell-height);
		display: flex;
		align-items: flex-start;
	}
</style>
