<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { MediaQuery } from 'svelte/reactivity';
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatDay, formatList, formatMinuteOfDay, formatTimeRange } from '$lib/analysis/format';
	import type { MeetingSet } from '$lib/analysis/meetingSets';
	import { app, withRange } from '$lib/state/app.svelte';
	import type { TimeRange } from '$lib/types';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { heatColor, heatMix as mix } from '$lib/ui/heat';
	import { isTyping } from '$lib/ui/keys';
	import PickedTime from './PickedTime.svelte';
	import SlotTooltip from './SlotTooltip.svelte';

	let { class: className = '' }: { class?: string } = $props();

	const event = $derived(app.event!);
	const grid = $derived(app.grid!);
	const free = $derived(event.slots.map((slot) => new Set(slot.available)));
	const spotlit = $derived(event.people.find((p) => p.id === app.pinnedPerson) ?? null);

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

	// Height follows time: a 15-minute slot is `quarterHeight` tall, a 30-minute one twice that, an
	// hour four times, so a stretch of the day takes the same room whatever the slot length. Long
	// days squeeze the quarter hours a little. Fingers get at least 24px per quarter hour, the
	// smallest comfortable target; the page scrolls instead.
	const coarse = new MediaQuery('(pointer: coarse)');
	const quarters = $derived(event.slotSeconds / 900);
	const quarterHeight = $derived.by(() => {
		const shown = grid.rows.length * quarters;
		return Math.max(shown > 64 ? 14 : shown > 40 ? 16 : 20, coarse.current ? 24 : 0);
	});
	const rowHeight = $derived(quarterHeight * quarters);

	const heat = (slot: number): string => {
		if (app.pinnedPerson !== null)
			return free[slot].has(app.pinnedPerson) ? mix(80) : 'var(--heat-0)';
		return heatColor(app.attendance!.counts[slot], app.attendance!.total);
	};

	/** Every required person is free but an optional one isn't: striped, so it stands apart. */
	const isPartial = (slot: number) => app.pinnedPerson === null && !!app.attendance?.partial[slot];
	const anyPartial = $derived(
		app.pinnedPerson === null && !!app.attendance?.partial.some((partial) => partial)
	);

	const legendSteps = $derived.by(() => {
		const steps = Math.min(app.attendance?.total ?? 0, 6);
		return Array.from({ length: steps + 1 }, (_, i) => heatColor(i, steps));
	});

	const held = $derived(app.heldSpans);
	/** Outlines for the blocks in play: one for a single time, one per meeting for a set. */
	const outlines = $derived(
		app.activeBlocks.flatMap((block) => {
			const start = position[block.startSlot];
			const end = position[block.endSlot];
			return start && end ? [{ key: `${block.startSlot}-${block.endSlot}`, start, end }] : [];
		})
	);
	/** Hovering previews other blocks; otherwise the outlines are the held ones. */
	const outlinesHeld = $derived(app.previewBlocks === null);
	const inHeld = (slot: number) => held.some((b) => slot >= b.startSlot && slot <= b.endSlot);

	// Tooltip placement, anchored to the hovered (or keyboard-focused) cell.
	let scroller: HTMLDivElement;
	let gridEl: HTMLDivElement;
	/** True when the grid took focus because the mouse moved over it, not from Tab. */
	let pointerFocused = $state(false);
	/** Where focus was before the mouse took it, to give it back when the mouse leaves. */
	let focusBefore: HTMLElement | null = null;
	/**
	 * The slot the arrow keys were last on. It outlives the tooltip, so leaving the grid (or
	 * pressing Escape to hide the details) and coming back carries on from the same place.
	 */
	let keySlot: number | null = null;
	/** Where a Shift+arrow range started, while Shift is held. */
	let keyAnchor: number | null = null;
	let tipRect = $state<DOMRect | null>(null);
	let tipHeight = $state(0);
	let tipWidth = $state(0);
	let viewport = $state({ w: 1024, h: 768 });

	const tipStyle = $derived.by(() => {
		if (!tipRect) return '';
		const width = tipWidth || 256;
		let left = tipRect.right + 10;
		if (left + width > viewport.w - 8) left = tipRect.left - 10 - width;
		left = Math.max(8, left);
		// Kept on screen, top edge first: a tooltip taller than the window still shows its time.
		const top = Math.max(8, Math.min(tipRect.top - 12, viewport.h - tipHeight - 8));
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

	// Picking times: a click (or tap, or Enter) picks a meeting-length time starting at that slot,
	// and a mouse drag picks exactly the slots it covers. Holding Shift adds to the times already
	// picked instead of replacing them.
	/** Slot a press started on, until the pointer comes back up. */
	let pressed: number | null = null;
	/** Whether the press turned into a drag. */
	let dragged = $state(false);
	/** Whether Shift was down at the press, and what was picked or pinned then. */
	let adding = false;
	let before: TimeRange[] = [];
	let pinnedBefore: { block: TimeBlock | null; set: MeetingSet | null } = {
		block: null,
		set: null
	};

	/** Slots from `from` toward `to` in the same day, stopping at any break in time. */
	const reach = (from: number, to: number): [number, number] => {
		const step = to >= from ? 1 : -1;
		let end = from;
		while (end !== to) {
			const next = end + step;
			const gap = Math.abs(event.slots[next].time - event.slots[end].time);
			if (gap !== event.slotSeconds || grid.dayOfSlot[next] !== grid.dayOfSlot[from]) break;
			end = next;
		}
		return step > 0 ? [from, end] : [end, from];
	};

	/**
	 * A click on a slot picks a meeting starting there. Clicking inside a picked time clears the
	 * picks; with Shift, it adds a time, or drops just the picked time it lands in.
	 */
	const pickAt = (slot: number, add: boolean) => {
		const hit = app.selectedBlocks.find((b) => slot >= b.startSlot && slot <= b.endSlot);
		if (hit) return add ? app.unpick(hit.start) : app.clearPick();
		const start = event.slots[slot].time;
		app.pick(start, start + app.duration * 60, { add });
	};

	const stopPress = () => {
		window.removeEventListener('pointerup', endPress);
		window.removeEventListener('pointercancel', endPress);
		window.removeEventListener('keydown', cancelPress, true);
		pressed = null;
		dragged = false;
	};

	const endPress = (e: PointerEvent) => {
		const clicked = pressed !== null && !dragged && e.type === 'pointerup' ? pressed : null;
		stopPress();
		if (clicked !== null) pickAt(clicked, adding);
	};

	/** Escape mid-drag drops the drag and puts back whatever was picked or pinned before it. */
	const cancelPress = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		// Used up here, so the page doesn't also back out a step.
		e.preventDefault();
		if (dragged) {
			app.setPicks(before);
			if (pinnedBefore.block) app.pinBlock(pinnedBefore.block);
			else if (pinnedBefore.set) app.pinSet(pinnedBefore.set);
		}
		stopPress();
	};

	const onpointerdown = (e: PointerEvent) => {
		if (e.button !== 0) return;
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
		if (!el) return;
		// Touch scrolls instead of dragging; a scroll cancels the pointer, so it won't pick.
		if (e.pointerType === 'mouse') e.preventDefault();
		pressed = Number(el.dataset.slot);
		dragged = false;
		adding = e.shiftKey;
		before = app.selection;
		pinnedBefore = { block: app.pinnedBlock, set: app.pinnedSet };
		window.addEventListener('pointerup', endPress);
		window.addEventListener('pointercancel', endPress);
		// Capture, to get Escape before the page's own handler backs out a step.
		window.addEventListener('keydown', cancelPress, true);
	};

	/** Extends a mouse drag to `slot`, counting a cell in another day as its row in the first one. */
	const dragTo = (slot: number) => {
		if (pressed === null) return;
		const day = grid.days[position[pressed].day];
		const target = day.slotByMinute.get(grid.rows[position[slot].row].minute);
		if (target === undefined || (target === pressed && !dragged)) return;
		dragged = true;
		const [first, last] = reach(pressed, target);
		const range = {
			start: event.slots[first].time,
			end: event.slots[last].time + event.slotSeconds
		};
		app.setPicks(adding ? withRange(before, range) : [range]);
	};

	const onpointerover = (e: PointerEvent) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
		if (!el) return;
		if (e.pointerType === 'mouse') dragTo(Number(el.dataset.slot));
		showTip(Number(el.dataset.slot), el);
		// Take focus on hover so the arrow keys work right away, unless someone is mid-typing.
		if (
			e.pointerType === 'mouse' &&
			document.activeElement !== gridEl &&
			!isTyping(document.activeElement)
		) {
			pointerFocused = true;
			focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			gridEl.focus({ preventScroll: true });
		}
	};

	const onpointerleave = (e: PointerEvent) => {
		// On touch, keep the tooltip up after the finger lifts; the next tap moves or clears it.
		if (e.pointerType === 'touch') return;
		hideTip();
		// Hand focus back to where it was (a keyboard user's place), or let it go so the arrow keys
		// scroll the page again.
		if (pointerFocused && document.activeElement === gridEl) {
			if (focusBefore?.isConnected && focusBefore !== document.body) {
				focusBefore.focus({ preventScroll: true });
			} else gridEl.blur();
		}
		focusBefore = null;
	};

	const focusSlot = async (slot: number) => {
		await tick();
		const el = scroller.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
		if (!el) return;
		el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		keySlot = slot;
		showTip(slot, el);
		// The picked-time card moves out of the way of the keys, as it does for the picks.
		queuePlaceCard();
	};

	/** Shift+Up/Down: picks exactly the slots from where Shift went down to here, in that day. */
	const extendTo = (slot: number) => {
		if (keyAnchor === null) return;
		const day = grid.days[position[keyAnchor].day];
		const target = day.slotByMinute.get(grid.rows[position[slot].row].minute);
		if (target === undefined) return;
		const [first, last] = reach(keyAnchor, target);
		app.setPicks([
			{ start: event.slots[first].time, end: event.slots[last].time + event.slotSeconds }
		]);
	};

	const onkeydown = (e: KeyboardEvent) => {
		const moves: Record<string, [number, number]> = {
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0]
		};
		// The first Escape only hides the details, as any popup should (WCAG 1.4.13). After that,
		// the workspace's handler backs out of whatever's pinned or picked.
		if (e.key === 'Escape') {
			if (!tipRect) return;
			e.preventDefault();
			return hideTip();
		}
		if ((e.key === 'Enter' || e.key === ' ') && app.hoveredSlot !== null) {
			e.preventDefault();
			return pickAt(app.hoveredSlot, e.shiftKey);
		}
		const move = moves[e.key];
		if (!move) return;
		e.preventDefault();
		const from = app.hoveredSlot ?? keySlot;
		const current = from !== null ? position[from] : null;
		if (!current) return focusSlot(grid.days[0].slotByMinute.values().next().value!);
		// Shift with Up or Down selects a range, a keyboard drag; anything else starts over.
		const ranging = e.shiftKey && move[0] === 0;
		if (!ranging) keyAnchor = null;
		else keyAnchor ??= from;

		let { day, row } = current;
		// Step until we land on a real slot, skipping blank cells.
		for (;;) {
			day += move[0];
			row += move[1];
			if (day < 0 || day >= grid.days.length || row < 0 || row >= grid.rows.length) return;
			const slot = grid.days[day].slotByMinute.get(grid.rows[row].minute);
			if (slot === undefined) continue;
			if (ranging) extendTo(slot);
			return focusSlot(slot);
		}
	};

	const onkeyup = (e: KeyboardEvent) => {
		if (e.key === 'Shift') keyAnchor = null;
	};

	/** Height of the sticky day header, so scrolling a slot into view stops below it. */
	let headerHeight = $state(0);
	/** Whether days have slid under the time column, which then gets an edge to sit them under. */
	let scrolledX = $state(false);

	// Bring a block (or a set's first meeting) into view when it's picked in best times.
	$effect(() => {
		if (!app.pinnedBlock && !app.pinnedSet) return;
		tick().then(() =>
			gridEl?.querySelector('.block-outline')?.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
			})
		);
	});

	// The picked-time card floats over the grid. It starts at the bottom center and moves to
	// whichever corner or edge covers the least of the picked times, so it never hides them.
	let root: HTMLDivElement;
	let card = $state<HTMLDivElement | null>(null);
	let cardSpot = $state<{ left: number; top: number } | null>(null);
	/** Which spot the card is in, kept while it stays clear so it doesn't hop around. */
	let spotIndex = 0;
	const wide = new MediaQuery('(min-width: 40rem)');
	const cardPad = $derived(wide.current ? 24 : 16);

	const placeCard = () => {
		if (!card || !scroller || !gridEl) return;
		const box = root.getBoundingClientRect();
		const view = scroller.getBoundingClientRect();
		const dayRow = gridEl.querySelector<HTMLElement>('.corner')?.offsetHeight ?? 0;
		const visibleTop = view.top + dayRow;
		// The picked times on screen, in page coordinates, and the cell the arrow keys are on.
		const cursorSlot = !pointerFocused && app.hoveredSlot !== null ? app.hoveredSlot : null;
		const covers = [
			...app.selectedBlocks,
			...(cursorSlot === null ? [] : [{ startSlot: cursorSlot, endSlot: cursorSlot }])
		];
		const picked = covers.flatMap((block) => {
			const first = gridEl.querySelector(`[data-slot="${block.startSlot}"]`);
			const last = gridEl.querySelector(`[data-slot="${block.endSlot}"]`);
			if (!first || !last) return [];
			const a = first.getBoundingClientRect();
			const z = last.getBoundingClientRect();
			const r = {
				left: Math.max(a.left, view.left),
				right: Math.min(a.right, view.right),
				top: Math.max(a.top, visibleTop),
				bottom: Math.min(z.bottom, view.bottom)
			};
			return r.right > r.left && r.bottom > r.top ? [r] : [];
		});

		const w = card.offsetWidth;
		const h = card.offsetHeight;
		const xs = [(box.width - w) / 2, cardPad, box.width - w - cardPad];
		const ys = [box.height - h - 16, Math.max(0, visibleTop - box.top + 8)];
		const spots = ys.flatMap((top) => xs.map((left) => ({ left, top })));
		const covered = spots.map(({ left, top }) =>
			picked.reduce((sum, r) => {
				const x = Math.min(r.right, box.left + left + w) - Math.max(r.left, box.left + left);
				const y = Math.min(r.bottom, box.top + top + h) - Math.max(r.top, box.top + top);
				return sum + Math.max(0, x) * Math.max(0, y);
			}, 0)
		);
		if (covered[spotIndex] > 0 || !cardSpot) {
			spotIndex = covered.indexOf(Math.min(...covered));
		}
		cardSpot = spots[spotIndex];
	};

	let placeQueued = false;
	const queuePlaceCard = () => {
		if (placeQueued || !card) return;
		placeQueued = true;
		requestAnimationFrame(() => {
			placeQueued = false;
			placeCard();
		});
	};

	$effect(() => {
		if (!card) return;
		const observer = new ResizeObserver(() => placeCard());
		observer.observe(root);
		observer.observe(card);
		return () => {
			observer.disconnect();
			cardSpot = null;
			spotIndex = 0;
		};
	});

	$effect(() => {
		void app.selectedBlocks;
		untrack(placeCard);
	});

	const hovered = $derived(app.hoveredSlot);
	/**
	 * The slot the arrow keys are on, in words: when, how many are free, and who isn't (the
	 * tooltip's list, which a screen reader can't otherwise reach).
	 */
	const liveLabel = $derived.by(() => {
		if (hovered === null || !app.attendance) return '';
		const t = event.slots[hovered].time;
		const when = `${formatDay(t, grid.zone, event.weekly)}, ${formatTimeRange(t, t + event.slotSeconds, grid.zone)}`;
		if (spotlit)
			return `${when}: ${spotlit.name} is ${free[hovered].has(spotlit.id) ? 'free' : 'not free'}`;
		const away = event.people
			.filter((p) => app.effectiveRoleOf(p.id) !== 'skip' && !free[hovered].has(p.id))
			.map((p) => p.name + (app.effectiveRoleOf(p.id) === 'optional' ? ' (optional)' : ''));
		const count =
			`${app.attendance.counts[hovered]} of ${app.attendance.total} available` +
			(isPartial(hovered) ? ', all required free' : '') +
			(inHeld(hovered) ? ', picked' : '');
		if (!away.length) return `${when}: ${count}, everyone can make it`;
		return away.length > 8
			? `${when}: ${count}`
			: `${when}: ${count}. Can’t make it: ${formatList(away)}`;
	});
</script>

<svelte:window onblur={hideTip} />

<!-- Always dark: color ramps read far better on a dark ground. In the light theme it sits in the
     page as a framed panel. -->
<div
	bind:this={root}
	class="relative flex min-h-0 flex-col bg-page scheme-dark light:m-3 light:overflow-hidden light:rounded-2xl light:shadow-[0_12px_32px_-14px_rgb(14_42_53/0.45)] light:sm:m-4 {spotlit
		? 'ring-2 ring-accent/70 ring-inset'
		: ''} {className}"
>
	<div
		class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-fg-2 sm:px-6"
	>
		{#if spotlit}
			<!-- Loud on purpose: the grid switches to one color, and that needs explaining at a glance. -->
			<div
				class="-my-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-accent/60 bg-accent-soft py-1 pr-1 pl-1"
			>
				<span class="flex min-w-0 items-center gap-2">
					<Avatar id={spotlit.id} name={spotlit.name} size={24} />
					<span class="truncate text-13 text-fg">
						Only
						<strong class="font-semibold">{spotlit.name}</strong>’s times
					</span>
				</span>
				<span class="flex items-center gap-2 text-fg-2" aria-hidden="true">
					<span class="flex items-center gap-1">
						<span class="size-3 rounded-sm" style:background={mix(80)}></span> Free
					</span>
					<span class="flex items-center gap-1">
						<span class="size-3 rounded-sm bg-heat-0 ring-1 ring-line-strong"></span> Not free
					</span>
				</span>
				<button
					class="btn btn-primary btn-sm rounded-full"
					onclick={() => {
						app.pinnedPerson = null;
						// The button goes with the banner; carry on from the grid.
						gridEl.focus({ preventScroll: true });
					}}
					title="Back to everyone (Esc)"
				>
					<X class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" /> Show everyone
				</button>
			</div>
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
				{#if anyPartial}
					<span class="flex items-center gap-1.5 text-fg-3">
						<span
							class="partial-swatch h-3 w-4 rounded-sm"
							style:--base={heatColor(3, 4)}
							aria-hidden="true"
						></span>
						All required free
					</span>
				{/if}
				{#if app.viewLabel}
					<span class="text-fg-3">· only {app.viewLabel}</span>
				{/if}
			</span>
			<span class="hidden text-fg-3 sm:inline"
				>Hover a cell for details. Click or drag to check any time, Shift to add more, Esc to clear.</span
			>
		{/if}
	</div>

	<!-- isolate keeps the sticky headers' z-index inside the grid, below the app's menus. -->
	<div
		bind:this={scroller}
		class="relative isolate max-h-[75dvh] min-h-0 flex-1 overflow-auto px-4 pb-6 sm:px-6 lg:max-h-none lg:overscroll-contain"
		style:scroll-padding-top="{headerHeight}px"
		style:scroll-padding-left="3.25rem"
		onscroll={() => {
			scrolledX = scroller.scrollLeft > 0;
			if (tipRect) hideTip();
			queuePlaceCard();
		}}
	>
		<!-- Focusable so arrow keys can walk the slots; the live region announces each one. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={gridEl}
			class="heatmap relative grid"
			class:dimmed={held.length > 0}
			class:pointer-focused={pointerFocused}
			style:--row="{rowHeight}px"
			style:--quarter="{quarterHeight}px"
			style:grid-template-columns="3.25rem repeat({grid.days.length}, minmax(2.75rem, 1fr))"
			style:grid-template-rows={layout.template}
			style:max-width="{3.25 + grid.days.length * 10}rem"
			role="application"
			aria-roledescription="availability grid"
			aria-label="Availability by day and time"
			aria-describedby="heatmap-keys"
			tabindex="0"
			{onpointerdown}
			{onpointerover}
			{onpointerleave}
			{onkeydown}
			{onkeyup}
			onfocus={() => {
				// Back from a Tab away: show where the keys left off.
				if (!pointerFocused && keySlot !== null) focusSlot(keySlot);
			}}
			onfocusout={() => {
				hideTip();
				pointerFocused = false;
			}}
		>
			<!-- Backs the header across the column gaps and grid edges, where an outline's glow would show. -->
			<div
				class="sticky top-0 z-[9] -mx-1.5 bg-page"
				style:grid-row="1"
				style:grid-column="1 / -1"
			></div>
			<div
				bind:offsetHeight={headerHeight}
				class="corner rail sticky top-0 left-0 z-20"
				class:scrolled={scrolledX}
				style:grid-row="1"
				style:grid-column="1"
			></div>
			<!-- One backing for the whole time column, so days scroll under it rather than between
			     the labels. -->
			<div
				class="rail sticky left-0 z-[4]"
				class:scrolled={scrolledX}
				style:grid-row="2 / -1"
				style:grid-column="1"
			></div>
			{#each grid.days as day, d (day.key)}
				<div
					class="sticky top-0 z-10 bg-page pt-1 pb-2 text-center"
					style:grid-row="1"
					style:grid-column={d + 2}
				>
					<div class="text-11 font-medium text-fg-3 uppercase">{day.weekday}</div>
					{#if day.date}
						<div class="text-13 font-semibold text-fg tabular">
							<span class="sm:hidden">{day.dayOfMonth}</span>
							<span class="hidden sm:inline">{day.date}</span>
						</div>
					{/if}
				</div>
			{/each}

			{#each grid.rows as row, i (row.minute)}
				{#if row.hour || i === 0 || row.gapBefore}
					<div
						class="sticky left-0 z-[5] pr-2 text-right text-11 leading-none text-fg-3 tabular"
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
							class:in-held={inHeld(slot)}
							class:hovered={hovered === slot}
							class:partial={isPartial(slot)}
							data-slot={slot}
							style:grid-row={layout.line[i]}
							style:grid-column={d + 2}
							style:--base={heat(slot)}
						></div>
					{/if}
				{/each}
			{/each}

			{#each outlines as box (box.key)}
				<div
					class="block-outline {outlinesHeld ? 'is-held' : ''}"
					style:grid-column={box.start.day + 2}
					style:grid-row="{layout.line[box.start.row]} / {layout.line[box.end.row] + 1}"
				></div>
			{/each}
		</div>
	</div>

	{#if app.selectedBlocks.length}
		<!-- Floats over the grid so picking a time doesn't shift the cells being dragged across, in
		     whichever spot keeps the picked times in view. -->
		<div
			bind:this={card}
			class="absolute z-20 max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl motion-safe:transition-[left,top] motion-safe:duration-200 {dragged
				? 'pointer-events-none'
				: ''}"
			style:width="min(28rem, calc(100% - {cardPad * 2}px))"
			style:left={cardSpot ? `${cardSpot.left}px` : null}
			style:top={cardSpot ? `${cardSpot.top}px` : null}
			style:visibility={cardSpot ? null : 'hidden'}
		>
			<PickedTime />
		</div>
	{/if}
</div>

<p id="heatmap-keys" class="sr-only">
	Arrow keys move between time slots. Enter checks a meeting starting at one, Shift+Enter adds
	another, and Shift with Up or Down checks an exact range. Escape hides the details, then clears.
</p>
<!-- Always present, so switching to one person's times (or back) is announced. -->
<p class="sr-only" role="status">{spotlit ? `Showing only ${spotlit.name}’s times` : ''}</p>
<p id="heatmap-live" class="sr-only" aria-live="polite">{liveLabel}</p>

{#if tipRect && hovered !== null}
	<div
		class="popover pointer-events-none fixed z-40 scheme-dark"
		style={tipStyle}
		bind:clientHeight={tipHeight}
		bind:clientWidth={tipWidth}
		role="tooltip"
	>
		<SlotTooltip slot={hovered} />
	</div>
{/if}

<style>
	.heatmap {
		column-gap: 4px;
		min-width: max-content;
		user-select: none;
	}
	@media (min-width: 40rem) {
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
		background: var(--base);
		transition: opacity 150ms;
	}
	/* Thin stripes in the palette's top color over a darkened cell: the heat color still shows the
	   count, and the stripes mark that everyone required is free. The stripes are a square tile that
	   divides a quarter hour evenly, and so every row, so they run unbroken from one row to the next. */
	.cell.partial,
	.partial-swatch {
		--tile: calc(var(--quarter, 14px) / 2);
		background:
			linear-gradient(
					135deg,
					var(--heat-high) 25%,
					transparent 25% 50%,
					var(--heat-high) 50% 75%,
					transparent 75%
				)
				0 0 / var(--tile) var(--tile),
			linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.45)),
			var(--base, var(--heat-0));
	}
	.cell:not(.empty) {
		cursor: pointer;
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
	/* Two tones, so the cursor shows on the palest cells as well as the darkest. */
	.cell.hovered {
		box-shadow:
			inset 0 0 0 2px var(--fg),
			inset 0 0 0 4px var(--canvas);
		z-index: 1;
	}
	.dimmed .cell:not(.in-held):not(.empty) {
		opacity: 0.45;
	}
	/* The time column's backing. It reaches left over the scroller's padding, which days would
	   otherwise show through, and once days are scrolled under it, right over the column gap too.
	   Painted like bg-page so it lines up with the page around it. */
	.rail::before {
		content: '';
		position: absolute;
		inset: 0 0 0 -1.5rem;
		background-color: var(--canvas);
		background-image: var(--glow);
		background-attachment: fixed;
	}
	.rail.scrolled::before {
		right: -4px;
		box-shadow: 6px 0 8px -6px rgb(0 0 0 / 0.6);
	}
	.block-outline {
		pointer-events: none;
		z-index: 2;
		border-radius: 6px;
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 4px var(--canvas);
		opacity: 0.85;
	}
	.block-outline.is-held {
		opacity: 1;
	}
</style>
