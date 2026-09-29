<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { PeopleGroup, Person } from '$lib/types';
	import { toast } from '$lib/ui/toast.svelte';

	let { group, people }: { group: PeopleGroup; people: Person[] } = $props();

	// Seeded once: the editor is remounted for each group, and the name saves as it's typed.
	// svelte-ignore state_referenced_locally
	const original = group.name;
	let name = $state(original);

	const present = $derived(membersIn(group, people).length);

	/** Deletes right away; the toast offers it back. */
	const remove = (message = `Deleted ${group.name}`) => {
		const { id } = group;
		const undo = groups.remove(id);
		app.setGroup(null);
		toast.show(message, {
			label: 'Undo',
			run: () => {
				undo();
				app.setGroup(id);
			}
		});
	};

	/** A group left with no one in it isn't worth keeping. */
	const done = () => {
		if (!present) remove(`Deleted ${group.name}, it was empty`);
		else app.editGroup(false);
	};

	const onkeydown = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
		if (e.key === 'Enter') e.currentTarget.blur();
		if (e.key !== 'Escape') return;
		e.preventDefault();
		name = original;
		groups.rename(group.id, original);
		e.currentTarget.blur();
	};

	/** Invites a real name while the group still has its placeholder one. */
	const nameOnMount = (node: HTMLInputElement) => {
		if (!/^Group \d+$/.test(original) || !matchMedia('(pointer: fine)').matches) return;
		node.focus();
		node.select();
	};
</script>

<div class="mt-2 rounded-lg bg-subtle p-1.5 pl-2">
	<div class="flex items-center gap-1.5">
		<input
			class="input h-8 min-w-0 flex-1 text-[13px] font-medium"
			aria-label="Group name"
			maxlength="40"
			bind:value={name}
			oninput={() => groups.rename(group.id, name)}
			onblur={() => {
				// The store never takes a blank name, so an emptied field shows the last good one.
				if (!name.trim()) name = group.name;
			}}
			{onkeydown}
			{@attach nameOnMount}
		/>
		<button
			class="btn btn-ghost btn-sm btn-icon shrink-0 text-fg-3 hover:bg-danger-soft hover:text-danger"
			onclick={() => remove()}
			aria-label="Delete {group.name}"
			title="Delete group"
		>
			<Trash2 class="size-3.5" />
		</button>
		<button class="btn btn-primary btn-sm shrink-0" onclick={done}>Done</button>
	</div>
	<p class="mt-1.5 px-0.5 text-[11px] text-fg-3">
		{present
			? 'Check or uncheck people below. Changes save as you go.'
			: 'Check the people below who belong in this group.'}
	</p>
</div>
