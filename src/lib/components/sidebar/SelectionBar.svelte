<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Funnel from '@lucide/svelte/icons/funnel';
	import X from '@lucide/svelte/icons/x';
	import { app } from '$lib/state/app.svelte';
	import { groups } from '$lib/state/groups.svelte';
	import type { PeopleGroup, Person, Role } from '$lib/types';
	import { dismissable } from '$lib/ui/dismissable';
	import { toast } from '$lib/ui/toast.svelte';

	let {
		people,
		visible
	}: {
		people: Person[];
		/** The people currently listed (after group filter and search). */
		visible: Person[];
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

	/** How many of the selected people are already in a group. */
	const inGroup = (group: PeopleGroup) => {
		const members = new Set(group.members);
		return selectedPeople.filter((p) => members.has(p.id)).length;
	};

	/** Adds the selected people to a group, or takes them out if they're all in it already. */
	const toggleIn = (group: PeopleGroup) => {
		const who = count > 1 ? count : selectedPeople[0].name;
		if (inGroup(group) === count) {
			groups.removeMembers(group.id, app.selected);
			toast.show(`Took ${who} out of ${group.name}`);
			// They've left the group on screen, so there's nothing left to act on.
			if (active?.id === group.id) {
				groupMenu = false;
				app.setSelected([]);
			}
		} else {
			groups.addMembers(group.id, app.selected);
			toast.show(`Added ${who} to ${group.name}`);
		}
	};

	const indeterminate = (node: HTMLInputElement) => {
		node.indeterminate = visibleSelected > 0 && !allVisible;
	};
</script>

<div class="flex h-9 items-center gap-2.5 px-4 pointer-coarse:h-11">
	<input
		type="checkbox"
		class="size-4 shrink-0 cursor-pointer accent-accent pointer-coarse:size-5"
		checked={allVisible}
		onchange={toggleAll}
		disabled={!visible.length}
		aria-label={allVisible ? 'Deselect everyone shown' : 'Select everyone shown'}
		{@attach indeterminate}
	/>
	{#if count}
		<span class="text-xs font-medium text-fg tabular">{count} selected</span>
		<button class="btn btn-ghost btn-sm ml-auto" onclick={() => app.setSelected([])}>
			<X class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
			Clear
		</button>
	{:else}
		<span class="text-xs text-fg-3">
			Select people to see their times, change their priorities, or form a group.
		</span>
	{/if}
</div>

{#if count}
	<div class="mx-3 mb-1 space-y-1.5 rounded-lg border border-accent/30 bg-accent-soft/40 p-2">
		<div class="grid grid-cols-2 gap-1.5">
			<!-- A quick look at just these people, like a group without saving one. -->
			<button
				class="btn btn-sm w-full {app.onlySelected ? 'btn-primary' : 'btn-secondary'}"
				aria-pressed={app.onlySelected}
				onclick={() => app.showOnlySelected(!app.onlySelected)}
				title={app.onlySelected
					? 'Show everyone again'
					: 'Narrow the heatmap and best times to just these people'}
			>
				<Funnel class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
				Just them
			</button>
			<div
				class="relative"
				{@attach groupMenu ? dismissable(() => (groupMenu = false)) : undefined}
			>
				<button
					class="btn btn-secondary btn-sm w-full"
					onclick={() => (groupMenu = !groupMenu)}
					aria-haspopup="menu"
					aria-expanded={groupMenu}
				>
					<FolderPlus class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					Group
					<ChevronDown class="size-3 text-fg-3 pointer-coarse:size-3.5" aria-hidden="true" />
				</button>
				{#if groupMenu}
					<div class="popover absolute top-full left-0 z-30 mt-1 w-56 p-1" role="menu">
						{#each groups.items as group (group.id)}
							{@const n = inGroup(group)}
							<button
								class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle pointer-coarse:py-2.5"
								role="menuitemcheckbox"
								aria-checked={n === count ? 'true' : n ? 'mixed' : 'false'}
								onclick={() => toggleIn(group)}
								title={n === count ? `Take them out of ${group.name}` : `Add them to ${group.name}`}
							>
								<span
									class="flex size-3.5 shrink-0 items-center justify-center text-accent-fg pointer-coarse:size-4.5"
								>
									{#if n === count}
										<Check class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
									{:else if n}
										<Minus class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
									{/if}
								</span>
								<span class="truncate">{group.name}</span>
							</button>
						{/each}
						{#if groups.items.length}<div class="my-1 border-t border-line"></div>{/if}
						<button
							class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-accent-fg hover:bg-subtle pointer-coarse:py-2.5"
							role="menuitem"
							onclick={() => {
								groupMenu = false;
								app.newGroup();
							}}
						>
							<Plus class="size-3.5 shrink-0 pointer-coarse:size-4.5" aria-hidden="true" />
							<span class="truncate">
								New group with {count === 1 ? selectedPeople[0]?.name : `these ${count}`}
							</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
		<div
			class="grid grid-cols-3 gap-0.5 rounded-lg bg-surface p-0.5 ring-1 ring-line"
			role="group"
			aria-label="Role for selected people"
		>
			{#each ROLES as role (role.value)}
				<button
					class="h-6 rounded-md px-2 text-xs font-medium transition-colors pointer-coarse:h-9 {sharedRole ===
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
{/if}
