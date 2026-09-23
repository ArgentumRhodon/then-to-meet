<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { Person } from '$lib/types';
	import { dismissable } from '$lib/ui/dismissable';
	import { toast } from '$lib/ui/toast.svelte';

	let {
		people,
		oncreate,
		onedit
	}: {
		people: Person[];
		oncreate: () => void;
		onedit: (id: string) => void;
	} = $props();

	// Picking a group narrows the heatmap and best times to its members right away.
	const active = $derived(app.group);

	let menuOpen = $state(false);
	let confirmDelete = $state(false);

	const present = $derived(active ? membersIn(active, people) : []);

	const chip = (on: boolean) =>
		`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
			on ? 'bg-accent text-on-accent' : 'bg-subtle text-fg-2 hover:text-fg'
		}`;

	const closeMenu = () => {
		menuOpen = false;
		confirmDelete = false;
	};

	const remove = () => {
		if (!active) return;
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		const name = active.name;
		groups.remove(active.id);
		app.setGroup(null);
		closeMenu();
		toast.show(`Deleted ${name}`);
	};
</script>

<div class="px-4 pt-2">
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Show a group">
		<button class={chip(!active)} aria-pressed={!active} onclick={() => app.setGroup(null)}>
			Everyone <span class="tabular opacity-60">{people.length}</span>
		</button>
		{#each groups.items as group (group.id)}
			<button
				class={chip(active?.id === group.id)}
				aria-pressed={active?.id === group.id}
				onclick={() => app.setGroup(active?.id === group.id ? null : group.id)}
			>
				<span class="truncate">{group.name}</span>
				<span class="tabular opacity-60">{membersIn(group, people).length}</span>
			</button>
		{/each}
		<button
			class="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 text-xs font-medium text-fg-2 hover:border-fg-3 hover:text-fg"
			onclick={oncreate}
		>
			<Plus class="size-3" aria-hidden="true" />
			New group
		</button>
	</div>

	{#if active}
		<div class="mt-2 flex items-center gap-2 rounded-lg bg-subtle py-1.5 pr-1.5 pl-3">
			<div class="min-w-0 flex-1">
				<p class="truncate text-[13px] font-medium">{active.name}</p>
				<p class="text-[11px] text-fg-3">
					Showing overlap for {present.length === 1
						? 'this 1 person'
						: `these ${present.length} people`}
				</p>
			</div>
			<div class="relative" {@attach menuOpen ? dismissable(closeMenu) : undefined}>
				<button
					class="btn btn-ghost btn-sm btn-icon"
					onclick={() => (menuOpen ? closeMenu() : (menuOpen = true))}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label="More actions for {active.name}"
				>
					<Ellipsis class="size-4" />
				</button>
				{#if menuOpen}
					<div class="popover absolute top-full right-0 z-30 mt-1 w-44 p-1" role="menu">
						<button
							class="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle"
							role="menuitem"
							onclick={() => {
								closeMenu();
								onedit(active.id);
							}}
						>
							Edit group
						</button>
						<button
							class="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-danger hover:bg-danger-soft"
							role="menuitem"
							onclick={remove}
						>
							{confirmDelete ? 'Click again to delete' : 'Delete group'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
