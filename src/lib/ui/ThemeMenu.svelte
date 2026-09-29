<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { theme, type ThemePref } from '$lib/state/theme.svelte';
	import { dismissable } from './dismissable';
	import { keepInView } from './keepInView';
	import HeatPaletteOptions from './HeatPaletteOptions.svelte';

	const OPTIONS = [
		{ value: 'dark', label: 'Dark', icon: Moon },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'system', label: 'System', hint: 'Match your device', icon: Monitor }
	] as const;

	let open = $state(false);
	const current = $derived(OPTIONS.find((o) => o.value === theme.pref) ?? OPTIONS[0]);

	const choose = (value: ThemePref) => {
		theme.set(value);
		open = false;
	};
</script>

<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Theme: {current.label}"
		title="Theme and heatmap colors, including colorblind-friendly palettes"
	>
		<current.icon class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
		{current.label}
		<ChevronDown class="size-3.5 text-fg-3 pointer-coarse:size-4" aria-hidden="true" />
	</button>
	{#if open}
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-72 p-1"
			role="menu"
			aria-label="Theme and heatmap colors"
			{@attach keepInView}
		>
			<p class="eyebrow px-2.5 pt-1.5 pb-1">Theme</p>
			{#each OPTIONS as option (option.value)}
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
					role="menuitemradio"
					aria-checked={theme.pref === option.value}
					onclick={() => choose(option.value)}
				>
					<option.icon class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
					<span class="flex-1">
						<span class="block text-[13px]">{option.label}</span>
						{#if 'hint' in option}<span class="block text-[11px] text-fg-3">{option.hint}</span
							>{/if}
					</span>
					<Check
						class="size-3.5 shrink-0 pointer-coarse:size-4.5 {theme.pref === option.value
							? 'text-accent'
							: 'invisible'}"
						aria-hidden="true"
					/>
				</button>
			{/each}
			<div class="my-1 border-t border-line"></div>
			<p class="eyebrow px-2.5 pt-1.5 pb-1">Heatmap colors</p>
			<HeatPaletteOptions onchoose={() => (open = false)} />
		</div>
	{/if}
</div>
