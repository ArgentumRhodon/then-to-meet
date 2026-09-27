<script lang="ts">
	import { tick } from 'svelte';

	/** Who can't make it, clamped to two lines with a toggle when the list runs longer. */
	let { names, label = 'Can’t make it' }: { names: string[]; label?: string } = $props();

	let expanded = $state(false);
	let overflowing = $state(false);

	// Re-measures on resize, and whenever the names change: a list that grows while already two
	// lines tall doesn't resize the clamped box, so a resize observer alone would miss it.
	const measure = (node: HTMLElement) => {
		void names.join();
		const check = () => (overflowing = node.scrollHeight > node.clientHeight + 1);
		tick().then(check);
		const observer = new ResizeObserver(check);
		observer.observe(node);
		return () => observer.disconnect();
	};
</script>

<div class="text-xs">
	<p class="text-fg-2 {expanded ? '' : 'line-clamp-2'}" {@attach measure}>
		<span class="text-fg-3">{label}:</span>
		{names.join(', ')}
	</p>
	{#if overflowing || expanded}
		<button
			class="mt-0.5 text-[11px] font-medium text-accent-fg hover:underline"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? 'Show less' : `Show all ${names.length}`}
		</button>
	{/if}
</div>
