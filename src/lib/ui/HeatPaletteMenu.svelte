<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Palette from '@lucide/svelte/icons/palette';
	import { heatPalette } from '$lib/state/heatPalette.svelte';
	import { dismissable } from './dismissable';
	import HeatPaletteOptions from './HeatPaletteOptions.svelte';

	let open = $state(false);
</script>

<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="btn btn-ghost btn-sm -my-1"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Heatmap colors, including colorblind-friendly palettes"
	>
		<Palette class="size-3.5" aria-hidden="true" />
		Colors: {heatPalette.label}
		<ChevronDown class="size-3 text-fg-3" aria-hidden="true" />
	</button>
	{#if open}
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-72 p-1"
			role="menu"
			aria-label="Heatmap colors"
		>
			<HeatPaletteOptions onchoose={() => (open = false)} />
		</div>
	{/if}
</div>
