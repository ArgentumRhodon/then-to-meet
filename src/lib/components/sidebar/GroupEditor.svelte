<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { tick } from 'svelte';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { PeopleGroup, Person } from '$lib/types';

	let {
		group,
		people,
		ondelete
	}: {
		group: PeopleGroup;
		people: Person[];
		/** Called once the group is gone, with what to say and how to bring it back. */
		ondelete: (message: string, undo: () => void) => void;
	} = $props();

	// Seeded once: the editor is remounted for each group, and the name saves as it's typed.
	// svelte-ignore state_referenced_locally
	const original = group.name;
	let name = $state(original);

	const present = $derived(membersIn(group, people).length);

	/** Deletes right away; the group bar offers it back, where the editor was. */
	const remove = () => {
		const { id } = group;
		const undo = groups.remove(id);
		app.setGroup(null);
		ondelete(`Deleted ${group.name}`, () => {
			undo();
			app.setGroup(id);
		});
	};

	/** An empty group stays: it may be saved now and filled in later. */
	const done = () => {
		app.editGroup(false);
		focusChips();
	};

	let doneButton = $state<HTMLButtonElement>();

	/** Enter keeps the name and Escape puts the old one back; either way, on to Done. */
	const onkeydown = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
		if (e.key === 'Enter') doneButton?.focus();
		if (e.key !== 'Escape') return;
		e.preventDefault();
		name = original;
		groups.rename(group.id, original);
		doneButton?.focus();
	};

	/** The editor is about to go away with focus in it; land on the group chips instead. */
	const focusChips = async () => {
		await tick();
		document
			.querySelector<HTMLElement>('[aria-label="Show a group"] [aria-pressed="true"]')
			?.focus();
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
			class="input h-8 min-w-0 flex-1 text-13 font-medium pointer-coarse:text-base"
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
			class="btn btn-ghost btn-sm btn-icon shrink-0 text-fg-2 hover:bg-danger-soft hover:text-danger"
			onclick={remove}
			aria-label="Delete {group.name}"
			title="Delete group"
		>
			<Trash2 class="size-3.5 pointer-coarse:size-4.5" />
		</button>
		<button class="btn btn-primary btn-sm shrink-0" bind:this={doneButton} onclick={done}
			>Done</button
		>
	</div>
	<p class="mt-1.5 px-0.5 text-11 text-fg-2">
		{present
			? 'Check or uncheck people below. Changes save as you go.'
			: 'Check the people below who belong in this group.'}
	</p>
</div>
