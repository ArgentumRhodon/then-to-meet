<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	let {
		title,
		count,
		note,
		startOpen = true,
		actions,
		children
	}: {
		title: string;
		count?: number | string;
		/** Shown in the header while the section is collapsed. */
		note?: string;
		startOpen?: boolean;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	const id = $props.id();
</script>

<section class="border-b border-line" aria-labelledby="{id}-title">
	<div class="flex h-12 items-center gap-2 pr-3 pl-4">
		<!-- The heading holds the button, not the other way round: a button can't contain one. -->
		<h2>
			<button
				class="-ml-1 flex h-10 items-center gap-1.5 rounded-md px-1 text-left"
				aria-expanded={open}
				aria-controls="{id}-body"
				onclick={() => (open = !open)}
			>
				<span id="{id}-title" class="text-[13px] font-semibold text-fg">{title}</span>
				{#if count !== undefined}
					<span
						class="rounded-full bg-subtle px-1.5 py-px text-[11px] font-medium text-fg-2 tabular"
					>
						{count}
					</span>
				{/if}
				<ChevronDown
					class="size-3.5 shrink-0 text-fg-3 transition-transform {open ? '' : '-rotate-90'}"
					aria-hidden="true"
				/>
			</button>
		</h2>
		{#if note && !open}
			<span class="min-w-0 truncate text-xs text-fg-3">{note}</span>
		{/if}
		<div class="ml-auto flex items-center gap-1">{@render actions?.()}</div>
	</div>
	{#if open}
		<div id="{id}-body" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
			{@render children()}
		</div>
	{/if}
</section>
