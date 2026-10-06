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
		collapsible = true,
		actions,
		children
	}: {
		title: string;
		count?: number | string;
		/** Shown in the header while the section is collapsed. */
		note?: string;
		startOpen?: boolean;
		/** A section with a column of its own has nothing to fold away into, so it stays open. */
		collapsible?: boolean;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	// svelte-ignore state_referenced_locally
	let folded = $state(!startOpen);
	const open = $derived(!collapsible || !folded);
	const id = $props.id();
</script>

{#snippet label()}
	<span id="{id}-title" class="text-13 font-semibold text-fg">{title}</span>
	{#if count !== undefined}
		<span class="rounded-full bg-subtle px-1.5 py-px text-11 font-medium text-fg-2 tabular">
			{count}
		</span>
	{/if}
{/snippet}

<section class="border-b border-line" aria-labelledby="{id}-title">
	<div class="flex h-12 items-center gap-2 pr-3 pl-4">
		{#if collapsible}
			<!-- The heading holds the button, not the other way round: a button can't contain one. -->
			<h2>
				<button
					class="-ml-1 flex h-10 items-center gap-1.5 rounded-md px-1 text-left"
					aria-expanded={open}
					aria-controls={open ? `${id}-body` : undefined}
					onclick={() => (folded = !folded)}
				>
					{@render label()}
					<ChevronDown
						class="size-3.5 shrink-0 text-fg-3 transition-transform {open ? '' : '-rotate-90'}"
						aria-hidden="true"
					/>
				</button>
			</h2>
		{:else}
			<h2 class="flex items-center gap-1.5">{@render label()}</h2>
		{/if}
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
