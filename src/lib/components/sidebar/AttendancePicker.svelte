<script lang="ts">
	import { app } from '$lib/state/app.svelte';
	import { heatColor } from '$lib/ui/heat';

	/**
	 * The least share of people a best time needs, as a slider with a stop per person, from the
	 * fewest any time gets (`min`) to the most (`max`). The track runs the heatmap's colors over that
	 * span, dimmed below the cutoff.
	 */
	let {
		considered,
		min,
		max,
		need
	}: { considered: number; min: number; max: number; need: number } = $props();

	const percent = $derived(Math.round((need / considered) * 100));
	/** Where the thumb sits, from 0 at `min` to 1 at `max`. */
	const at = $derived((need - min) / (max - min));
	/** The heatmap's color for each stop, so the track matches what those counts look like there. */
	const ramp = $derived(
		Array.from({ length: 5 }, (_, i) => {
			const people = min + ((max - min) * i) / 4;
			return `${heatColor(people, considered)} ${i * 25}%`;
		}).join(', ')
	);
</script>

<label class="block">
	<span class="flex items-baseline justify-between gap-2 text-[13px]">
		<span class="text-fg-2">Attendance</span>
		<span class="tabular">
			<span class="font-semibold text-fg">{percent}%{need < max ? '+' : ''}</span>
			<span class="text-fg-3">· {need} of {considered}</span>
		</span>
	</span>
	<input
		type="range"
		class="attendance mt-1.5"
		{min}
		{max}
		step="1"
		value={need}
		style:--at={at}
		style:--ramp={ramp}
		aria-label="Attendance"
		aria-valuetext="At least {need} of {considered} people"
		oninput={(e) => app.setMinMatch(Number(e.currentTarget.value) / considered)}
	/>
</label>

<style>
	.attendance {
		--thumb: 1rem;
		--track: 0.375rem;
		/* The thumb's center, which is where the cutoff falls along the track. */
		--cut: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--at));
		--dim: color-mix(in oklab, var(--panel) 72%, transparent);
		--fill:
			linear-gradient(to right, var(--dim) var(--cut), transparent 0),
			linear-gradient(to right, var(--ramp));
		display: block;
		width: 100%;
		height: var(--thumb);
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	.attendance:focus-visible {
		outline: none;
	}

	.attendance::-webkit-slider-runnable-track {
		height: var(--track);
		border-radius: 999px;
		background: var(--fill);
	}

	.attendance::-moz-range-track {
		height: var(--track);
		border-radius: 999px;
		background: var(--fill);
	}

	.attendance::-webkit-slider-thumb {
		appearance: none;
		width: var(--thumb);
		height: var(--thumb);
		margin-top: calc((var(--track) - var(--thumb)) / 2);
		border: 2px solid var(--fg);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: 0 1px 3px var(--shadow-tint);
	}

	.attendance::-moz-range-thumb {
		width: var(--thumb);
		height: var(--thumb);
		box-sizing: border-box;
		border: 2px solid var(--fg);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: 0 1px 3px var(--shadow-tint);
	}

	.attendance:focus-visible::-webkit-slider-thumb {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.attendance:focus-visible::-moz-range-thumb {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
