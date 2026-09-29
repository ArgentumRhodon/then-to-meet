<script lang="ts">
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import { formatList } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { Person } from '$lib/types';
	import GroupEditor from './GroupEditor.svelte';

	let { people }: { people: Person[] } = $props();

	// Picking a group narrows the heatmap and best times to its members right away.
	const active = $derived(app.group);
	const editing = $derived(app.editingGroup ? active : undefined);

	const present = $derived(active ? membersIn(active, people) : []);
	/** "Alex Rivera, Priya Natarajan, and 2 others", for a view of just the checked people. */
	const checkedNames = $derived.by(() => {
		const names = people.filter((p) => app.selected.has(p.id)).map((p) => p.name);
		const shown = names.slice(0, names.length > 3 ? 2 : 3);
		const rest = names.length - shown.length;
		return formatList(rest ? [...shown, `${rest} other${rest === 1 ? '' : 's'}`] : shown);
	});
	const peopleCount = (n: number) => (n === 1 ? 'this 1 person' : `these ${n} people`);

	const chip = (on: boolean) =>
		`inline-flex h-7 max-w-full items-center pointer-coarse:h-9 gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
			on ? 'bg-accent text-on-accent' : 'bg-subtle text-fg-2 hover:text-fg'
		}`;
</script>

<div class="px-4 pt-2">
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Show a group">
		<button
			class={chip(!app.viewLabel)}
			aria-pressed={!app.viewLabel}
			onclick={() => app.showEveryone()}
		>
			Everyone <span class="tabular opacity-60">{people.length}</span>
		</button>
		{#if app.onlySelected}
			<!-- Just the checked people: a group that isn't saved. -->
			<button
				class={chip(true)}
				aria-pressed="true"
				onclick={() => app.showOnlySelected(false)}
				title="Just the people you selected. Click to show everyone."
			>
				Selected <span class="tabular opacity-60">{app.selected.size}</span>
			</button>
		{/if}
		{#if app.sharedGroup}
			<!-- A group from someone else's link: a view, not one of this viewer's saved groups. -->
			<button
				class={chip(true)}
				aria-pressed="true"
				onclick={() => app.showEveryone()}
				title="From a shared link. Click to show everyone."
			>
				<span class="truncate">{app.sharedGroup}</span>
			</button>
		{/if}
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
			class="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 text-xs font-medium text-fg-2 hover:border-fg-3 hover:text-fg pointer-coarse:h-9"
			onclick={() => app.newGroup()}
			title={app.selected.size
				? 'Start a group with the people you selected'
				: 'Start a group, then check who’s in it'}
		>
			<Plus class="size-3 pointer-coarse:size-3.5" aria-hidden="true" />
			New group
		</button>
	</div>

	{#if editing}
		{#key editing.id}
			<GroupEditor group={editing} {people} />
		{/key}
	{:else if app.onlySelected}
		<div class="mt-2 flex items-center gap-2 rounded-lg bg-subtle py-1.5 pr-1.5 pl-3">
			<div class="min-w-0 flex-1">
				<p class="truncate text-[13px] font-medium">{checkedNames}</p>
				<p class="text-[11px] text-fg-3">
					Showing overlap for {peopleCount(app.selected.size)}, not saved
				</p>
			</div>
			<button class="btn btn-secondary btn-sm shrink-0" onclick={() => app.newGroup()}>
				<FolderPlus class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
				Save as group
			</button>
		</div>
	{:else if active}
		<div class="mt-2 flex items-center gap-2 rounded-lg bg-subtle py-1.5 pr-1.5 pl-3">
			<div class="min-w-0 flex-1">
				<p class="truncate text-[13px] font-medium">{active.name}</p>
				<p class="text-[11px] text-fg-3">
					Showing overlap for {peopleCount(present.length)}
				</p>
			</div>
			<button
				class="btn btn-ghost btn-sm btn-icon shrink-0"
				aria-label="Edit {active.name}"
				title="Edit group"
				onclick={() => app.editGroup(true)}
			>
				<Pencil class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
			</button>
		</div>
	{/if}
</div>
