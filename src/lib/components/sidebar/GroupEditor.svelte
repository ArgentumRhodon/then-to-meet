<script lang="ts">
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { PeopleGroup, Person } from '$lib/types';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { dismissable } from '$lib/ui/dismissable';
	import { toast } from '$lib/ui/toast.svelte';

	let {
		people,
		group,
		preset = [],
		onclose,
		onsaved
	}: {
		people: Person[];
		/** The group being edited; omit to create a new one. */
		group?: PeopleGroup;
		/** People to start checked when creating. */
		preset?: number[];
		onclose: () => void;
		onsaved: (id: string) => void;
	} = $props();

	const id = $props.id();
	// Seeded once from props: this popover is remounted for every group it edits.
	// svelte-ignore state_referenced_locally
	let name = $state(group?.name ?? '');
	// svelte-ignore state_referenced_locally
	let checked = $state(new Set(group ? membersIn(group, people).map((p) => p.id) : preset));
	let error = $state('');

	const toggle = (pid: number) => {
		const next = new Set(checked);
		if (!next.delete(pid)) next.add(pid);
		checked = next;
	};

	const save = (e: SubmitEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			error = 'Give the group a name.';
			return;
		}
		const members = people.filter((p) => checked.has(p.id)).map((p) => p.id);
		if (!members.length) {
			error = 'Check at least one person.';
			return;
		}
		if (group) {
			groups.rename(group.id, name);
			groups.setMembers(group.id, members);
			toast.show(`Saved ${name.trim()}`);
			onsaved(group.id);
		} else {
			const existed = groups.hasName(name);
			const created = groups.create(name, members);
			toast.show(existed ? `Added to ${created.name}` : `Created ${created.name}`);
			onsaved(created.id);
		}
	};

	const focusOnMount = (node: HTMLInputElement) => {
		if (matchMedia('(pointer: fine)').matches) node.focus();
	};
</script>

<form
	class="popover absolute inset-x-3 top-full z-30 mt-1.5 p-3"
	aria-label={group ? `Edit ${group.name}` : 'New group'}
	onsubmit={save}
	{@attach dismissable(onclose)}
>
	<label for="{id}-name" class="text-xs font-medium text-fg-2">Group name</label>
	<input
		id="{id}-name"
		class="input mt-1 h-8 text-[13px]"
		placeholder="Design team"
		maxlength="40"
		bind:value={name}
		oninput={() => (error = '')}
		{@attach focusOnMount}
	/>

	<div class="mt-3 mb-1 flex items-center justify-between">
		<span class="text-xs font-medium text-fg-2">Members · {checked.size}</span>
		<span class="flex gap-1">
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				onclick={() => (checked = new Set(people.map((p) => p.id)))}
			>
				All
			</button>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => (checked = new Set())}
				>None</button
			>
		</span>
	</div>
	<ul class="-mx-1 max-h-56 overflow-y-auto">
		{#each people as person (person.id)}
			<li>
				<label
					class="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-subtle"
				>
					<input
						type="checkbox"
						class="size-4 shrink-0 cursor-pointer accent-accent"
						checked={checked.has(person.id)}
						onchange={() => toggle(person.id)}
					/>
					<Avatar id={person.id} name={person.name} size={22} />
					<span class="truncate text-[13px]">{person.name}</span>
				</label>
			</li>
		{/each}
	</ul>
	{#if error}<p class="mt-2 text-xs text-danger" role="alert">{error}</p>{/if}

	<div class="mt-3 flex justify-end gap-1.5">
		<button type="button" class="btn btn-ghost btn-sm" onclick={onclose}>Cancel</button>
		<button type="submit" class="btn btn-primary btn-sm">{group ? 'Save' : 'Create group'}</button>
	</div>
</form>
