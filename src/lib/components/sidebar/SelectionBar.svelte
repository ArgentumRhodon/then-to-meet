<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import X from '@lucide/svelte/icons/x';
	import { app } from '$lib/state/app.svelte';
	import { groups } from '$lib/state/groups.svelte';
	import type { PeopleGroup, Person, Role } from '$lib/types';
	import { dismissable } from '$lib/ui/dismissable';
	import { toast } from '$lib/ui/toast.svelte';

	let {
		people,
		visible,
		onnewgroup
	}: {
		people: Person[];
		/** The people currently listed (after group filter and search). */
		visible: Person[];
		onnewgroup: () => void;
	} = $props();

	const active = $derived(app.group);

	const ROLES: { value: Role; label: string }[] = [
		{ value: 'required', label: 'Required' },
		{ value: 'optional', label: 'Optional' },
		{ value: 'skip', label: 'Skip' }
	];

	let groupMenu = $state(false);

	const count = $derived(app.selected.size);
	const selectedPeople = $derived(people.filter((p) => app.selected.has(p.id)));
	const visibleSelected = $derived(visible.filter((p) => app.selected.has(p.id)).length);
	const allVisible = $derived(visible.length > 0 && visibleSelected === visible.length);
	/** The role everyone selected shares, if they all share one. */
	const sharedRole = $derived.by(() => {
		const roles = new Set(selectedPeople.map((p) => app.roleOf(p.id)));
		return roles.size === 1 ? [...roles][0] : null;
	});

	const toggleAll = () => {
		const ids = new Set(app.selected);
		for (const p of visible) {
			if (allVisible) ids.delete(p.id);
			else ids.add(p.id);
		}
		app.setSelected(ids);
	};

	const addTo = (group: PeopleGroup) => {
		groups.addMembers(group.id, app.selected);
		groupMenu = false;
		toast.show(`Added ${count} to ${group.name}`);
	};

	const removeFromActive = () => {
		if (!active) return;
		groups.removeMembers(active.id, app.selected);
		toast.show(`Removed ${count} from ${active.name}`);
		app.setSelected([]);
	};

	const indeterminate = (node: HTMLInputElement) => {
		node.indeterminate = visibleSelected > 0 && !allVisible;
	};
</script>

<div class="flex h-9 items-center gap-2.5 px-4">
	<input
		type="checkbox"
		class="size-4 shrink-0 cursor-pointer accent-accent"
		checked={allVisible}
		onchange={toggleAll}
		disabled={!visible.length}
		aria-label={allVisible ? 'Deselect everyone shown' : 'Select everyone shown'}
		{@attach indeterminate}
	/>
	{#if count}
		<span class="text-xs font-medium text-fg tabular">{count} selected</span>
		<button class="btn btn-ghost btn-sm ml-auto" onclick={() => app.setSelected([])}>
			<X class="size-3.5" aria-hidden="true" />
			Clear
		</button>
	{:else}
		<span class="text-xs text-fg-3">Select people to change several at once</span>
	{/if}
</div>

{#if count}
	<div class="mx-3 mb-1 space-y-2 rounded-lg border border-accent/30 bg-accent-soft/40 p-2.5">
		<div class="flex items-center gap-2">
			<span class="text-xs text-fg-2">Make them</span>
			<div
				class="ml-auto flex rounded-lg bg-surface p-0.5 ring-1 ring-line"
				role="group"
				aria-label="Role for selected people"
			>
				{#each ROLES as role (role.value)}
					<button
						class="h-6 rounded-md px-2 text-[11px] font-medium transition-colors {sharedRole ===
						role.value
							? 'bg-accent text-on-accent'
							: 'text-fg-2 hover:bg-subtle hover:text-fg'}"
						aria-pressed={sharedRole === role.value}
						onclick={() => app.setRoles(app.selected, role.value)}
					>
						{role.label}
					</button>
				{/each}
			</div>
		</div>
		<div class="flex flex-wrap gap-1.5">
			<div
				class="relative"
				{@attach groupMenu ? dismissable(() => (groupMenu = false)) : undefined}
			>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => (groupMenu = !groupMenu)}
					aria-haspopup="menu"
					aria-expanded={groupMenu}
				>
					<FolderPlus class="size-3.5" aria-hidden="true" />
					Add to group
					<ChevronDown class="size-3 text-fg-3" aria-hidden="true" />
				</button>
				{#if groupMenu}
					<div class="popover absolute top-full left-0 z-30 mt-1 w-56 p-1" role="menu">
						{#each groups.items as group (group.id)}
							<button
								class="w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle"
								role="menuitem"
								onclick={() => addTo(group)}
							>
								{group.name}
							</button>
						{/each}
						{#if groups.items.length}<div class="my-1 border-t border-line"></div>{/if}
						<button
							class="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-accent-fg hover:bg-subtle"
							role="menuitem"
							onclick={() => {
								groupMenu = false;
								onnewgroup();
							}}
						>
							New group from selection…
						</button>
					</div>
				{/if}
			</div>
			{#if active}
				<button class="btn btn-ghost btn-sm" onclick={removeFromActive}>
					Remove from {active.name}
				</button>
			{/if}
		</div>
	</div>
{/if}
