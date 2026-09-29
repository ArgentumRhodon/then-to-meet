<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { DateTime } from 'luxon';
	import { recent } from '$lib/state/recent.svelte';

	let {
		onopen,
		currentId = null,
		limit = 12
	}: { onopen: (id: string) => void; currentId?: string | null; limit?: number } = $props();

	const items = $derived(recent.items.filter((e) => e.id !== currentId).slice(0, limit));

	const ago = (ms: number) =>
		ms > 1_000_000_000_000 ? (DateTime.fromMillis(ms).toRelative({ style: 'short' }) ?? '') : '';
</script>

{#if items.length}
	<ul class="space-y-0.5">
		{#each items as item (item.id)}
			<li class="group flex items-center gap-1 rounded-lg hover:bg-subtle">
				<button
					class="min-w-0 flex-1 px-3 py-2 text-left"
					onclick={() => onopen(item.id)}
					title="Open {item.title}"
				>
					<span class="block truncate text-sm font-medium text-fg">{item.title}</span>
					<span class="block truncate text-xs text-fg-3">
						{[
							item.people ? `${item.people} ${item.people === 1 ? 'person' : 'people'}` : '',
							ago(item.openedAt)
						]
							.filter(Boolean)
							.join(' · ') || item.id}
					</span>
				</button>
				<button
					class="btn btn-ghost btn-sm btn-icon mr-1.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
					onclick={() => recent.forget(item.id)}
					aria-label="Remove {item.title} from recent events"
					title="Remove from recent"
				>
					<X class="size-3.5 pointer-coarse:size-4.5" />
				</button>
			</li>
		{/each}
	</ul>
{/if}
