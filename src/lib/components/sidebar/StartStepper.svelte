<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { app } from '$lib/state/app.svelte';

	/**
	 * The open card's time, between arrows that slide the meeting earlier or later within its
	 * window, one slot at a time. Tinted like the accent so it reads as something to press, and the
	 * heatmap follows as the highlight moves.
	 */
	let { label, position, count }: { label: string; position: number; count: number } = $props();

	/** One slot a click; Shift makes it half an hour, and Ctrl (or Cmd) with Shift an hour. */
	const step = (direction: -1 | 1, e: MouseEvent) => {
		const minutes = e.shiftKey ? (e.ctrlKey || e.metaKey ? 60 : 30) : 0;
		const slot = (app.event?.slotSeconds ?? 900) / 60;
		app.stepPin(direction * (minutes ? Math.max(1, Math.round(minutes / slot)) : 1));
	};

	const arrow =
		'flex h-10 w-11 shrink-0 items-center justify-center text-accent-fg transition-colors hover:bg-accent/20 active:bg-accent/30 aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-transparent';
</script>

<div
	class="flex items-center overflow-hidden rounded-xl border border-accent/60 bg-accent-soft"
	role="group"
	aria-label="Start time"
>
	<button
		class={arrow}
		aria-disabled={position <= 0}
		onclick={(e) => position > 0 && step(-1, e)}
		aria-label="Start earlier"
		title="Start earlier (Shift: 30m, Ctrl+Shift: 1h)"
	>
		<ChevronLeft class="size-5" />
	</button>
	<output
		class="min-w-0 flex-1 text-center text-15 font-semibold tracking-tight tabular"
		aria-live="polite"
	>
		{label}
	</output>
	<button
		class={arrow}
		aria-disabled={position >= count - 1}
		onclick={(e) => position < count - 1 && step(1, e)}
		aria-label="Start later"
		title="Start later (Shift: 30m, Ctrl+Shift: 1h)"
	>
		<ChevronRight class="size-5" />
	</button>
</div>
