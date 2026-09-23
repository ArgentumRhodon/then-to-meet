<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import Search from '@lucide/svelte/icons/search';
	import { formatDuration } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { groups, membersIn } from '$lib/state/groups.svelte';
	import type { Role } from '$lib/types';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { layout } from '$lib/ui/layout.svelte';
	import GroupBar from './GroupBar.svelte';
	import GroupEditor from './GroupEditor.svelte';
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
	/** The group editor popover: creating a new group, or editing an existing one. */
	let editor = $state<{ groupId: string | null; preset: number[] } | null>(null);
	/** Anchor for shift-click ranges. */
	let lastChecked: number | null = null;

	const people = $derived(app.event?.people ?? []);
	const inView = $derived(app.group ? membersIn(app.group, people) : people);
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? inView.filter((p) => p.name.toLowerCase().includes(q)) : inView;
	});

	const freeMinutes = $derived.by(() => {
		const map = new Map<number, number>();
		const event = app.event;
		if (!event) return map;
		for (const slot of event.slots) {
			for (const id of slot.available) map.set(id, (map.get(id) ?? 0) + event.slotSeconds / 60);
		}
		return map;
	});
	const maxFree = $derived(Math.max(1, ...freeMinutes.values()));

	const counts = $derived.by(() => {
		const c = { required: 0, optional: 0, skip: 0 };
		for (const p of inView) c[app.roleOf(p.id)]++;
		return c;
	});
	const customized = $derived(people.some((p) => app.roleOf(p.id) !== 'required'));
	const summary = $derived(
		[
			counts.required && `${counts.required} required`,
			counts.optional && `${counts.optional} optional`,
			counts.skip && `${counts.skip} skipped`,
			app.group &&
				people.length > inView.length &&
				`${people.length - inView.length} outside ${app.group.name}`
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** Checkbox click; shift-click selects the whole range since the last one. */
	const check = (e: MouseEvent, index: number) => {
		const person = visible[index];
		const anchor = lastChecked === null ? -1 : visible.findIndex((p) => p.id === lastChecked);
		if (e.shiftKey && anchor >= 0) {
			const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
			const on = !app.selected.has(person.id);
			const next = new Set(app.selected);
			for (const p of visible.slice(from, to + 1)) {
				if (on) next.add(p.id);
				else next.delete(p.id);
			}
			app.setSelected(next);
		} else {
			app.toggleSelected(person.id);
		}
		lastChecked = person.id;
	};
</script>

<Section title="People" count={people.length} note={summary} {startOpen}>
	{#snippet actions()}
		{#if customized}
			<button class="btn btn-ghost btn-sm" onclick={() => app.resetRoles()}>Reset roles</button>
		{/if}
	{/snippet}

	<div class="px-4 text-xs">
		<p class="text-fg-2">{summary}</p>
		{#if !customized && !groups.items.length}
			<p class="mt-0.5 text-fg-3">
				{layout.showHeatmap
					? 'Tap a role to change it. Hover a name to see just their times.'
					: 'Tap a role to change it, or tap names to change several at once.'}
			</p>
		{/if}
	</div>

	<div class="relative">
		<GroupBar
			{people}
			oncreate={() => (editor = { groupId: null, preset: [...app.selected] })}
			onedit={(id) => (editor = { groupId: id, preset: [] })}
		/>
		{#if editor}
			{#key editor}
				<GroupEditor
					{people}
					group={groups.get(editor.groupId)}
					preset={editor.preset}
					onclose={() => (editor = null)}
					onsaved={(id) => {
						editor = null;
						app.setGroup(id);
					}}
				/>
			{/key}
		{/if}
	</div>

	{#if people.length > 8}
		<div class="relative px-4 pt-2">
			<Search
				class="pointer-events-none absolute top-1/2 left-7 mt-1 size-3.5 -translate-y-1/2 text-fg-3"
				aria-hidden="true"
			/>
			<input
				class="input h-8 pl-8 text-[13px]"
				type="search"
				placeholder="Find a person"
				aria-label="Find a person"
				bind:value={query}
			/>
		</div>
	{/if}

	<div class="pt-1.5">
		<SelectionBar
			{people}
			{visible}
			onnewgroup={() => (editor = { groupId: null, preset: [...app.selected] })}
		/>
	</div>

	<!-- Only big groups get their own scroll area, so best times stay reachable. -->
	<ul
		class="px-2 pb-3 {visible.length > 12 ? 'lg:max-h-[45dvh] lg:overflow-y-auto' : ''}"
		onpointerleave={() => (app.hoveredPerson = null)}
	>
		{#each visible as person, index (person.id)}
			{@const role = app.roleOf(person.id)}
			{@const pinned = app.pinnedPerson === person.id}
			{@const selected = app.selected.has(person.id)}
			{@const free = freeMinutes.get(person.id) ?? 0}
			<li
				class="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors {selected
					? 'bg-accent-soft/50'
					: pinned
						? 'bg-subtle'
						: 'hover:bg-subtle'}"
				onpointerenter={() => (app.hoveredPerson = person.id)}
			>
				<input
					type="checkbox"
					class="size-4 shrink-0 cursor-pointer accent-accent"
					checked={selected}
					onclick={(e) => check(e, index)}
					aria-label="Select {person.name}"
				/>
				<button
					class="flex min-w-0 flex-1 items-center gap-2.5 text-left {role === 'skip'
						? 'opacity-55'
						: ''}"
					aria-pressed={layout.showHeatmap ? pinned : selected}
					title={layout.showHeatmap
						? pinned
							? 'Stop spotlighting'
							: `Show only ${person.name}’s availability`
						: undefined}
					tabindex={layout.showHeatmap ? 0 : -1}
					onclick={() => {
						// With no grid to spotlight on, a tap on the name selects the person instead.
						if (layout.showHeatmap) app.pinnedPerson = pinned ? null : person.id;
						else app.toggleSelected(person.id);
					}}
					onfocus={() => (app.hoveredPerson = person.id)}
					onblur={() => (app.hoveredPerson = null)}
				>
					<Avatar id={person.id} name={person.name} />
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-1.5">
							<span
								class="truncate text-[13px] font-medium {role === 'skip' ? 'line-through' : ''}"
							>
								{person.name}
							</span>
							{#if pinned}<Eye class="size-3.5 shrink-0 text-accent-fg" aria-hidden="true" />{/if}
						</span>
						<span class="mt-1 flex items-center gap-2">
							<span class="h-1 w-12 overflow-hidden rounded-full bg-line">
								<span
									class="block h-full rounded-full bg-accent/70"
									style:width="{(free / maxFree) * 100}%"
								></span>
							</span>
							<span class="text-[11px] text-fg-3 tabular">{formatDuration(free)} free</span>
						</span>
					</span>
				</button>
				<button
					class="h-6 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors hover:border-line-strong {CHIP[
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
</Section>
