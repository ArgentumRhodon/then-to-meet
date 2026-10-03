<script lang="ts">
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

	const onpointerdown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const slot = cellAt(e.clientX, e.clientY);
		if (slot === null) return;
		// The first cell decides whether the drag marks or clears.
		mode = selected.has(slot) ? 'remove' : 'add';
		drag = { anchor: slot, base: selected };
		stretchTo(slot);
		gridEl?.setPointerCapture(e.pointerId);
		e.preventDefault();
	};

	const onpointermove = (e: PointerEvent) => {
		if (!drag) return;
		const slot = cellAt(e.clientX, e.clientY);
		if (slot !== null) stretchTo(slot);
	};

	const end = () => {
		mode = null;
		drag = null;
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

<div class="overflow-x-auto">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={gridEl}
		class="picker grid"
		style:grid-template-columns="3rem repeat({grid.days.length}, minmax(2.75rem, 1fr))"
		style:max-width="{3 + grid.days.length * 9}rem"
		role="grid"
		aria-label="Your availability. Use arrow keys to move between time slots and Space to mark or clear one."
		tabindex="0"
		{onpointerdown}
		{onpointermove}
		onpointerup={end}
		onpointercancel={end}
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
	/* Vertical swipes scroll the page on a touch screen, so painting there is by tapping or by
	   swiping sideways; a day or hour label fills a whole line at once. */
	.cell {
		touch-action: pan-y;
	}
	.cell {
		height: 1.25rem;
		background: color-mix(in oklab, var(--fg) 9%, transparent);
		transition: background-color 80ms;
	}
	.cell.hour {
		box-shadow: 0 -1px 0 var(--line-strong);
	}
	.cell.empty {
		background: transparent;
	}
	.cell:not(.empty):hover {
		background: color-mix(in oklab, var(--accent) 35%, transparent);
	}
	.cell.on {
		background: var(--accent);
	}
	.cell.on:hover {
		background: var(--accent-hover);
	}
	.picker:focus-visible .cell.cursor {
		outline: 2px solid var(--fg);
		outline-offset: -2px;
	}
	.label {
		height: 1.25rem;
		display: flex;
		align-items: flex-start;
	}
</style>
