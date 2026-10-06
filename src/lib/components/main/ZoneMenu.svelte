<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Globe from '@lucide/svelte/icons/globe';
	import { formatZone } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';
	import { returnFocus } from '$lib/ui/menu';
	import TimezoneList from '$lib/ui/TimezoneList.svelte';

	/**
	 * The zone the times are shown in, said where the times are, and changed right there. Settings
	 * has the same choice, but a time without its zone is easy to misread on a shared link.
	 */
	let open = $state(false);

	// The offset in effect during the event, not today's, in case daylight saving changes between.
	const label = $derived(formatZone(app.zone, app.event?.slots[0]?.time));
</script>

<div class="relative inline-block" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="-mx-1 inline-flex items-center gap-1 rounded px-1 text-left text-fg-2 underline decoration-fg-3 decoration-dotted underline-offset-4 hover:text-fg pointer-coarse:py-2"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="dialog"
		aria-label="Times in {label}. Change timezone"
	>
		<Globe class="size-3.5 shrink-0 pointer-coarse:size-4.5" aria-hidden="true" />
		{label}
		<ChevronDown class="size-3 shrink-0 pointer-coarse:size-4" aria-hidden="true" />
	</button>
	{#if open}
		<div
			class="popover absolute top-full left-0 z-30 mt-1.5 max-h-[calc(100dvh-8rem)] w-72 overflow-y-auto"
			role="dialog"
			aria-label="Timezone"
			{@attach keepInView}
			{@attach returnFocus}
		>
			<TimezoneList onchoose={() => (open = false)} />
		</div>
	{/if}
</div>
