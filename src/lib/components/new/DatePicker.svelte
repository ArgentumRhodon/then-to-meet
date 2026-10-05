<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { DateTime } from 'luxon';
	import { onMount } from 'svelte';
	import { sweep } from '$lib/ui/sweep';

	let {
		selected,
		onchange
	}: {
		/** ISO dates like 2026-10-05. */
		selected: readonly string[];
		onchange: (next: string[]) => void;
	} = $props();

	// "Today" and the month shown depend on the visitor's clock, so they're set once in the browser
	// rather than guessed during server rendering.
	let today = $state<string | null>(null);
	let month = $state<DateTime | null>(null);
	let mode: 'add' | 'remove' | null = null;
	let lastX = 0;
	let lastY = 0;

	onMount(() => {
		const now = DateTime.now();
		today = now.toISODate();
		month = now.startOf('month');
	});

	const chosen = $derived(new Set(selected));

	/** The month as weeks of dates, starting on Sunday, with nulls before the 1st and after the last. */
	const weeks = $derived.by(() => {
		if (!month) return [];
		const lead = month.weekday % 7;
		const cells: (string | null)[] = [
			...Array(lead).fill(null),
			...Array.from({ length: month.daysInMonth! }, (_, i) => month!.plus({ days: i }).toISODate())
		];
		while (cells.length % 7) cells.push(null);
		return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
	});

	const past = (date: string) => today !== null && date < today;

	const set = (date: string, on: boolean) => {
		if (past(date) || chosen.has(date) === on) return;
		const next = new Set(chosen);
		if (on) next.add(date);
		else next.delete(date);
		onchange([...next].sort());
	};

	const dateAt = (x: number, y: number): string | null =>
		document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null;

	const onpointerdown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const date = dateAt(e.clientX, e.clientY);
		if (!date || past(date)) return;
		mode = chosen.has(date) ? 'remove' : 'add';
		lastX = e.clientX;
		lastY = e.clientY;
		set(date, mode === 'add');
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	};

	const onpointermove = (e: PointerEvent) => {
		if (!mode) return;
		sweep(lastX, lastY, e.clientX, e.clientY, (x, y) => {
			const date = dateAt(x, y);
			if (date) set(date, mode === 'add');
		});
		lastX = e.clientX;
		lastY = e.clientY;
	};

	const end = () => (mode = null);
</script>

<div class="select-none">
	<div class="mb-2 flex items-center gap-1">
		<button
			type="button"
			class="btn btn-ghost btn-icon btn-sm"
			onclick={() => (month = month!.minus({ months: 1 }))}
			disabled={!month ||
				(today !== null && month.startOf('month') <= DateTime.fromISO(today).startOf('month'))}
			aria-label="Previous month"
		>
			<ChevronLeft class="size-4" aria-hidden="true" />
		</button>
		<h3 class="flex-1 text-center text-sm font-semibold" aria-live="polite">
			{month ? month.toLocaleString({ month: 'long', year: 'numeric' }) : ' '}
		</h3>
		<button
			type="button"
			class="btn btn-ghost btn-icon btn-sm"
			onclick={() => (month = month!.plus({ months: 1 }))}
			disabled={!month}
			aria-label="Next month"
		>
			<ChevronRight class="size-4" aria-hidden="true" />
		</button>
	</div>

	<div
		class="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-fg-3 uppercase"
		aria-hidden="true"
	>
		{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as letter, i (i)}
			<span>{letter}</span>
		{/each}
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="mt-1 grid gap-1"
		role="group"
		aria-label="Dates. Click or drag to choose them."
		{onpointerdown}
		{onpointermove}
		onpointerup={end}
		onpointercancel={end}
	>
		{#each weeks as week, w (w)}
			<div class="grid grid-cols-7 gap-1">
				{#each week as date, d (d)}
					{#if date}
						<button
							type="button"
							class="day"
							class:on={chosen.has(date)}
							class:today={date === today}
							data-date={date}
							disabled={past(date)}
							aria-pressed={chosen.has(date)}
							aria-label={DateTime.fromISO(date).toLocaleString(DateTime.DATE_HUGE)}
							onclick={(e) => e.detail === 0 && set(date, !chosen.has(date))}
						>
							{Number(date.slice(8))}
						</button>
					{:else}
						<span></span>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.day {
		height: 2.25rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
		background: color-mix(in oklab, var(--fg) 6%, transparent);
		touch-action: pan-y;
		transition: background-color 80ms;
	}
	.day:not(:disabled):hover {
		background: color-mix(in oklab, var(--accent) 30%, transparent);
	}
	.day:disabled {
		color: var(--fg-3);
		opacity: 0.4;
		cursor: not-allowed;
	}
	.day.today {
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.day.on {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}
	.day:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 1px;
	}
</style>
