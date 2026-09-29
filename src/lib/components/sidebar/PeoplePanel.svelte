<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import { splitSignIns } from '$lib/analysis/signIns';
	import { buildReminder } from '$lib/share/reminder';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { Role } from '$lib/types';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import { copyText } from '$lib/ui/toast.svelte';
	import GroupBar from './GroupBar.svelte';
	import Section from './Section.svelte';
	import SelectionBar from './SelectionBar.svelte';

	const NEXT: Record<Role, Role> = { required: 'optional', optional: 'skip', skip: 'required' };
	const LABEL: Record<Role, string> = {
		required: 'Required',
		optional: 'Optional',
		skip: 'Skipped'
	};
	let { startOpen = true }: { startOpen?: boolean } = $props();

	const CHIP: Record<Role, string> = {
		required: 'bg-secondary-soft text-secondary-fg border-transparent',
		optional: 'bg-subtle text-fg-2 border-transparent',
		skip: 'border-dashed border-line-strong text-fg-3'
	};

	let query = $state('');
	/** Anchor for shift-click ranges. */
	let lastChecked: number | null = null;

	const people = $derived(app.event?.people ?? []);
	/** The group open for editing: the list shows everyone, and its checkboxes are membership. */
	const editing = $derived(app.editingGroup ? app.group : undefined);
	const members = $derived(new Set(editing?.members));
	const inView = $derived(!editing && app.group ? membersIn(app.group, people) : people);
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? inView.filter((p) => p.name.toLowerCase().includes(q)) : inView;
	});

	const counts = $derived.by(() => {
		const c = { required: 0, optional: 0, skip: 0 };
		for (const p of inView) c[app.roleOf(p.id)]++;
		return c;
	});
	const customized = $derived(people.some((p) => app.roleOf(p.id) !== 'required'));

	const names = $derived(new Map(people.map((p) => [p.id, p.name])));
	const added = $derived(new Set(app.changes.added));
	const updated = $derived(new Set(app.changes.updated));
	/** "Mei, Diego, and 2 others" */
	const nameList = (ids: number[]) => {
		const shown = ids.slice(0, ids.length > 3 ? 2 : 3).map((id) => names.get(id) ?? 'Someone');
		const rest = ids.length - shown.length;
		if (rest) shown.push(`${rest} other${rest === 1 ? '' : 's'}`);
		return shown.length > 1
			? `${shown.slice(0, -1).join(', ')}${shown.length > 2 ? ',' : ''} and ${shown.at(-1)}`
			: shown[0];
	};
	const newCount = $derived(added.size + updated.size);
	/** Who still needs to respond, minus empty sign-ins that look like someone who did. */
	const signIns = $derived(splitSignIns(app.event?.noTimes ?? [], people));

	const summary = $derived(
		[
			newCount && `${newCount} new`,
			counts.required && `${counts.required} required`,
			counts.optional && `${counts.optional} optional`,
			counts.skip && `${counts.skip} skipped`,
			app.group &&
				people.length > inView.length &&
				`${people.length - inView.length} outside ${app.group.name}`,
			app.onlySelected && `${inView.length - app.selected.size} not shown`
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** Whether a person's checkbox is on: in the group being edited, or else selected. */
	const isChecked = (id: number) => (editing ? members.has(id) : app.selected.has(id));

	const setChecked = (ids: number[], on: boolean) => {
		if (editing) {
			if (on) groups.addMembers(editing.id, ids);
			else groups.removeMembers(editing.id, ids);
			return;
		}
		const next = new Set(app.selected);
		for (const id of ids) {
			if (on) next.add(id);
			else next.delete(id);
		}
		app.setSelected(next);
	};

	/** Checkbox click; shift-click sets the whole range since the last one. */
	const check = (e: MouseEvent, index: number) => {
		const person = visible[index];
		const anchor = lastChecked === null ? -1 : visible.findIndex((p) => p.id === lastChecked);
		const range =
			e.shiftKey && anchor >= 0
				? visible.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
				: [person];
		setChecked(
			range.map((p) => p.id),
			!isChecked(person.id)
		);
		lastChecked = person.id;
	};

	const visibleMembers = $derived(visible.filter((p) => members.has(p.id)).length);
	const allMembers = $derived(visible.length > 0 && visibleMembers === visible.length);
	const indeterminate = (node: HTMLInputElement) => {
		node.indeterminate = visibleMembers > 0 && !allMembers;
	};
</script>

<Section title="People" count={people.length} note={summary} {startOpen}>
	{#snippet actions()}
		{#if customized}
			<button class="btn btn-ghost btn-sm" onclick={() => app.resetRoles()}>Reset roles</button>
		{/if}
	{/snippet}

	{#if newCount}
		<div
			class="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-accent-soft/60 py-2 pr-1.5 pl-3 text-xs text-accent-fg"
			role="status"
		>
			<Sparkles class="mt-px size-3.5 shrink-0" aria-hidden="true" />
			<p class="min-w-0 flex-1">
				Since your last visit:
				{#if added.size}
					<strong class="font-semibold">{nameList(app.changes.added)}</strong>
					responded{updated.size ? ';' : '.'}
				{/if}
				{#if updated.size}
					<strong class="font-semibold">{nameList(app.changes.updated)}</strong>
					changed their times.
				{/if}
			</p>
			<button
				class="-my-1 flex size-6 shrink-0 items-center justify-center rounded hover:bg-accent/10 pointer-coarse:-my-2 pointer-coarse:size-9"
				onclick={() => app.dismissChanges()}
				aria-label="Dismiss"
			>
				<X class="size-3.5 pointer-coarse:size-4.5" />
			</button>
		</div>
	{/if}

	<!-- <div class="px-4 text-xs">
		<p class="text-fg-2">{summary}</p>
		{#if !customized && !groups.items.length}
			<p class="mt-0.5 text-fg-3">
				{layout.showHeatmap
					? 'Tap a role to change it. Hover a name to preview their times, or use the eye to keep them on the grid.'
					: 'Tap a role to change it, or tap names to change several at once.'}
			</p>
		{/if}
	</div> -->

	<GroupBar {people} />

	{#if people.length > 8}
		<div class="relative px-4 pt-2">
			<Search
				class="pointer-events-none absolute top-1/2 left-7 mt-1 size-3.5 -translate-y-1/2 text-fg-3"
				aria-hidden="true"
			/>
			<input
				class="input h-8 pl-8 text-[13px] pointer-coarse:text-base"
				type="search"
				placeholder="Find a person"
				aria-label="Find a person"
				bind:value={query}
			/>
		</div>
	{/if}

	<div class="pt-1.5">
		{#if editing}
			<div class="flex h-9 items-center gap-2.5 px-4">
				<input
					type="checkbox"
					class="size-4 shrink-0 cursor-pointer accent-accent pointer-coarse:size-5"
					checked={allMembers}
					onchange={() =>
						setChecked(
							visible.map((p) => p.id),
							!allMembers
						)}
					disabled={!visible.length}
					aria-label={allMembers
						? `Take everyone shown out of ${editing.name}`
						: `Put everyone shown in ${editing.name}`}
					{@attach indeterminate}
				/>
				<span class="text-xs text-fg-2 tabular">
					{membersIn(editing, people).length} of {people.length} in {editing.name}
				</span>
			</div>
		{:else}
			<SelectionBar {people} {visible} />
		{/if}
	</div>

	<!-- Only big groups get their own scroll area, so best times stay reachable. -->
	<ul
		class="px-2 pb-3 {visible.length > 12 ? 'lg:max-h-[45dvh] lg:overflow-y-auto' : ''}"
		onpointerleave={() => (app.hoveredPerson = null)}
	>
		{#each visible as person, index (person.id)}
			{@const role = app.roleOf(person.id)}
			{@const pinned = app.pinnedPerson === person.id}
			{@const selected = isChecked(person.id)}
			<li
				class="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors {pinned
					? 'bg-accent-soft/40 ring-1 ring-accent/60 ring-inset'
					: selected
						? 'bg-accent-soft/50'
						: 'hover:bg-subtle'}"
				onpointerenter={() => (app.hoveredPerson = person.id)}
			>
				<input
					type="checkbox"
					class="size-4 shrink-0 cursor-pointer accent-accent pointer-coarse:size-5"
					checked={selected}
					onclick={(e) => check(e, index)}
					aria-label={editing ? `${person.name} is in ${editing.name}` : `Select ${person.name}`}
				/>
				<!-- The name selects the person, like the checkbox. Showing only their times on the grid
				     is the eye button's job, so a stray click never changes what the heatmap means. -->
				<!-- Dimmed when skipped, left out of a view of just the selected people, or outside the
				     group being edited. -->
				<button
					class="ml-0.5 flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left pointer-coarse:-my-1.5 {(
						editing ? !selected : role === 'skip' || (app.onlySelected && !selected)
					)
						? 'opacity-55'
						: ''}"
					aria-pressed={selected}
					tabindex={-1}
					onclick={(e) => check(e, index)}
				>
					<Avatar id={person.id} name={person.name} />
					<span class="flex min-w-0 flex-1 items-center gap-1.5">
						<span
							class="truncate text-[13px] font-medium {role === 'skip' && !editing
								? 'line-through'
								: ''}"
						>
							{person.name}
						</span>
						{#if added.has(person.id)}
							<span
								class="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-fg"
								>New</span
							>
						{:else if updated.has(person.id)}
							<span
								class="shrink-0 rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn"
								>Updated</span
							>
						{/if}
					</span>
				</button>
				{#if layout.showHeatmap}
					<button
						class="btn btn-sm btn-icon shrink-0 {pinned
							? 'bg-accent text-on-accent hover:bg-accent-hover'
							: 'btn-ghost pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100'}"
						aria-pressed={pinned}
						aria-label={pinned
							? `Stop showing only ${person.name}’s times`
							: `Show only ${person.name}’s times on the grid`}
						title={pinned ? 'Show everyone again' : `Show only ${person.name}’s times`}
						onclick={() => (app.pinnedPerson = pinned ? null : person.id)}
						onfocus={() => (app.hoveredPerson = person.id)}
						onblur={() => (app.hoveredPerson = null)}
					>
						<Eye class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					</button>
				{/if}
				<!-- Roles step aside while a group is edited, so every click in the list is about who's in it. -->
				{#if !editing}
					<button
						class="h-6 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:border-line-strong pointer-coarse:h-8 pointer-coarse:px-3 pointer-coarse:text-xs {CHIP[
							role
						]}"
						onclick={() => app.setRole(person.id, NEXT[role])}
						aria-label="{person.name} is {LABEL[role].toLowerCase()}. Change to {LABEL[
							NEXT[role]
						].toLowerCase()}"
						title="Change to {LABEL[NEXT[role]].toLowerCase()}"
					>
						{LABEL[role]}
					</button>
				{/if}
			</li>
		{:else}
			<li class="px-2 py-3 text-[13px] text-fg-3">
				{#if query.trim()}
					No one matches that search.
				{:else if app.group}
					No one in {app.group.name} is in this poll anymore.
				{:else}
					No one has marked any times yet.
				{/if}
			</li>
		{/each}
	</ul>

	{#if signIns.waiting.length || signIns.extras.length}
		<div class="mx-4 mb-4 space-y-1.5 rounded-lg bg-subtle py-2 pr-1.5 pl-3 text-xs">
			{#if signIns.waiting.length}
				<div class="flex items-start gap-2">
					<p class="min-w-0 flex-1 text-fg-3">
						<span class="font-medium text-fg-2">Signed in without marking times:</span>
						{signIns.waiting.map((p) => p.name).join(', ')}
					</p>
					<button
						class="btn btn-secondary btn-sm shrink-0"
						onclick={() => copyText(buildReminder(app.event!, signIns.waiting), 'Reminder copied')}
						title="Copy a message asking them to add their times"
					>
						<MessageSquare class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
						Copy reminder
					</button>
				</div>
			{/if}
			{#if signIns.extras.length}
				<!-- Left out of the list and the reminder, but shown on request in case a match is wrong. -->
				<details class="text-fg-3">
					<summary class="cursor-pointer py-0.5 select-none hover:text-fg-2 pointer-coarse:py-2">
						{signIns.extras.length} extra sign-in{signIns.extras.length === 1 ? '' : 's'} left out
					</summary>
					<p class="mt-1 mb-0.5 text-fg-3">
						These signed in without marking times, but look like someone who did:
					</p>
					<ul class="space-y-0.5">
						{#each signIns.extras as { person, like } (person.id)}
							<li>
								<span class="text-fg-2">{person.name}</span> → {like.name}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}
</Section>
