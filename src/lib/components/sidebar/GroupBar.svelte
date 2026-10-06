<script lang="ts">
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { tick } from 'svelte';
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

	/**
	 * A group just deleted, offered back right where it was for a while. Undo sits here rather than
	 * in a toast, where a keyboard or screen reader user can't get to it in time.
	 */
	const UNDO_MS = 10_000;
	let deleted = $state.raw<{ message: string; undo: () => void } | null>(null);
	let undoButton = $state<HTMLButtonElement>();
	let undoTimer: ReturnType<typeof setTimeout> | undefined;

	const focusChip = async () => {
		await tick();
		document
			.querySelector<HTMLElement>('[aria-label="Show a group"] [aria-pressed="true"]')
			?.focus();
	};

	const forget = () => {
		clearTimeout(undoTimer);
		const hadFocus = !!undoButton && document.activeElement === undoButton;
		deleted = null;
		if (hadFocus) focusChip();
	};

	const ondelete = async (message: string, undo: () => void) => {
		clearTimeout(undoTimer);
		deleted = { message, undo };
		undoTimer = setTimeout(forget, UNDO_MS);
		// The delete button went with the editor; Undo is the nearest thing to where focus was.
		await tick();
		undoButton?.focus();
	};

	$effect(() => () => clearTimeout(undoTimer));

	const chip = (on: boolean) =>
		`inline-flex h-7 max-w-full items-center pointer-coarse:h-9 gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
			on
				? 'bg-accent text-on-accent light:ring-1 light:ring-accent-strong'
				: 'bg-subtle text-fg-2 hover:text-fg'
		}`;
</script>

<div class="px-4 pt-2">
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Show a group">
		<button
			class={chip(!app.viewLabel)}
			aria-pressed={!app.viewLabel}
			onclick={() => app.showEveryone()}
		>
			Everyone <span class="font-normal tabular">{people.length}</span>
		</button>
		{#if app.onlySelected}
			<!-- Just the checked people: a group that isn't saved. -->
			<button
				class={chip(true)}
				aria-pressed="true"
				onclick={() => app.showOnlySelected(false)}
				title="Just the people you selected. Click to show everyone."
			>
				Selected <span class="font-normal tabular">{app.selected.size}</span>
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
				<span class="font-normal tabular">{membersIn(group, people).length}</span>
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

	<!-- Always in the page, so the deletion is announced as it appears. -->
	<div aria-live="polite">
		{#if deleted}
			<div class="mt-2 flex items-center gap-2 rounded-lg bg-subtle py-1.5 pr-1.5 pl-3">
				<p class="min-w-0 flex-1 truncate text-13 text-fg-2">{deleted.message}</p>
				<button
					class="btn btn-secondary btn-sm shrink-0"
					bind:this={undoButton}
					onclick={() => {
						deleted?.undo();
						forget();
					}}
				>
					<Undo2 class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					Undo
				</button>
			</div>
		{/if}
	</div>

	{#if editing}
		{#key editing.id}
			<GroupEditor group={editing} {people} {ondelete} />
		{/key}
	{:else if app.onlySelected}
		<div class="mt-2 flex items-center gap-2 rounded-lg bg-subtle py-1.5 pr-1.5 pl-3">
			<div class="min-w-0 flex-1">
				<p class="truncate text-13 font-medium">{checkedNames}</p>
				<p class="text-11 text-fg-2">
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
				<p class="truncate text-13 font-medium">{active.name}</p>
				<p class="text-11 text-fg-2">
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
