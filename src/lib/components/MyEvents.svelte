<script lang="ts">
	import { DateTime } from 'luxon';
	import type { EventSummary } from '$lib/events/model';
	import { accounts } from '$lib/state/accounts.svelte';

	let { onopen, limit = 6 }: { onopen: (id: string) => void; limit?: number } = $props();

	let items = $state.raw<EventSummary[]>([]);
	const uid = $derived(accounts.user?.uid);

	// Reload when someone signs in or out; a failure just leaves the section empty.
	$effect(() => {
		items = [];
		if (!uid) return;
		let stale = false;
		accounts
			.events()
			.then((events) => {
				if (!stale) items = events.slice(0, limit);
			})
			.catch(() => {});
		return () => (stale = true);
	});
</script>

{#if items.length}
	<section class="mx-auto mt-10 w-full max-w-xl" aria-labelledby="mine-heading">
		<h2 id="mine-heading" class="eyebrow mb-2 px-3 text-fg-2">Your events</h2>
		<ul class="card space-y-0.5 p-1.5">
			{#each items as item (item.id)}
				<li>
					<button
						class="block w-full rounded-lg px-3 py-2 text-left hover:bg-subtle"
						onclick={() => onopen(item.id)}
						title="Open {item.title}"
					>
						<span class="block truncate text-sm font-medium text-fg">{item.title}</span>
						<span class="block truncate text-xs text-fg-3">
							{[
								`${item.responseCount} ${item.responseCount === 1 ? 'person' : 'people'}`,
								item.owned ? 'You own this' : 'You responded',
								item.importedFrom ? 'Imported from When2Meet' : '',
								DateTime.fromMillis(item.updatedAt).toRelative({ style: 'short' })
							]
								.filter(Boolean)
								.join(' · ')}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}
