<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte';
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
	aria-live="polite"
>
	{#if toast.message}
		<div
			class="flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas shadow-pop"
			transition:fly={{ y: 8, duration: 160 }}
		>
			<Check class="size-4" aria-hidden="true" />
			{toast.message}
		</div>
	{/if}
</div>
