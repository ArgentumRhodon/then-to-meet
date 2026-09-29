<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte';
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
	aria-live="polite"
>
	{#if toast.message}
		<div
			class="flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas shadow-pop {toast.action
				? 'pointer-events-auto py-1.5 pr-1.5'
				: ''}"
			transition:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : 160 }}
		>
			<Check class="size-4" aria-hidden="true" />
			{toast.message}
			{#if toast.action}
				<button
					class="ml-1 rounded-full px-2.5 py-0.5 font-semibold text-canvas hover:bg-canvas/15 pointer-coarse:px-3.5 pointer-coarse:py-2"
					onclick={() => {
						const { run } = toast.action!;
						toast.hide();
						run();
					}}
				>
					{toast.action.label}
				</button>
			{/if}
		</div>
	{/if}
</div>
