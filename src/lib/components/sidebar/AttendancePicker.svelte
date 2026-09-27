<script lang="ts">
	import { app } from '$lib/state/app.svelte';

	/**
	 * The least share of people a best time needs, as a slider with a stop per person. The track runs
	 * the heatmap's colors from one person to everyone, dimmed below the cutoff.
	 */
	let { considered }: { considered: number } = $props();

	const need = $derived(app.minPeople);
	const percent = $derived(Math.round((need / considered) * 100));
	/** Where the thumb sits, from 0 at one person to 1 at everyone. */
	const at = $derived(considered > 1 ? (need - 1) / (considered - 1) : 1);
</script>

<label class="block">
	<span class="flex items-baseline justify-between gap-2 text-[13px]">
		<span class="text-fg-2">Attendance</span>
		<span class="tabular">
			<span class="font-semibold text-fg">{percent}%{need < considered ? '+' : ''}</span>
			<span class="text-fg-3">· {need} of {considered}</span>
		</span>
	</span>
	<input
		type="range"
		class="attendance mt-1.5"
		min="1"
		max={considered}
		step="1"
		value={need}
		style:--at={at}
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
			linear-gradient(to right, var(--heat-low), var(--heat-mid) 70%, var(--heat-high));
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
