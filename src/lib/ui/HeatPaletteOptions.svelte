<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { HEAT_PALETTES, heatPalette, type HeatPalette } from '$lib/state/heatPalette.svelte';
	import { heatColor } from './heat';

	/** The palette choices as menu items, each with a preview of its colors. */
	let { onchoose }: { onchoose?: (palette: HeatPalette) => void } = $props();

	const STEPS = [1, 2, 3, 4, 5];
</script>

{#each HEAT_PALETTES as palette (palette.value)}
	<button
		class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
		role="menuitemradio"
		aria-checked={heatPalette.current === palette.value}
		onclick={() => {
			heatPalette.set(palette.value);
			onchoose?.(palette.value);
		}}
	>
		<!-- data-heat scopes the palette's colors to this preview; dark, like the heatmap. -->
		<span
			class="flex shrink-0 gap-px rounded-[5px] bg-canvas p-1 scheme-dark"
			data-heat={palette.value}
			aria-hidden="true"
		>
			{#each STEPS as step (step)}
				<span
					class="h-3 w-2.5 first:rounded-l-sm last:rounded-r-sm"
					style:background={heatColor(step, STEPS.length)}
				></span>
			{/each}
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[13px]">{palette.label}</span>
			<span class="block text-[11px] text-fg-3">{palette.hint}</span>
		</span>
		<Check
			class="size-3.5 shrink-0 pointer-coarse:size-4.5 {heatPalette.current === palette.value
				? 'text-accent'
				: 'invisible'}"
			aria-hidden="true"
		/>
	</button>
{/each}
