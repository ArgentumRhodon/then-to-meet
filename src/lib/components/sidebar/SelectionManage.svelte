<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import type { Person } from '$lib/types';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import PasswordDialog from '../main/PasswordDialog.svelte';

	let { selectedPeople }: { selectedPeople: Person[] } = $props();

	/**
	 * Who is being removed, fixed when "Remove…" is clicked. The selection changes as people are
	 * removed (and is cleared at the end), so the dialog and the toast can't read it live.
	 */
	let removeTargets = $state.raw<Person[] | null>(null);
	let passwordFor = $state.raw<Person | null>(null);

	/** Only ThenToMeet's own events have anyone to manage; When2Meet's are managed on When2Meet. */
	const native = $derived(app.event?.source === 'thentomeet');
	/** The event's owner can remove people. */
	const canRemove = $derived(native && !!app.event && accounts.owns(app.event));
	/** One person with a password can have it changed or removed, by whoever knows it. */
	const lockedPerson = $derived(
		native && selectedPeople.length === 1 && selectedPeople[0].locked ? selectedPeople[0] : null
	);

	const label = (people: Person[]) =>
		people.length === 1 ? people[0].name : `${people.length} people`;

	/** Removes each person, one at a time so the event's count stays right. */
	const remove = async (targets: Person[]) => {
		const id = app.event!.id;
		const removed = label(targets);
		for (const person of targets) await accounts.deleteEntry(id, person.name);
		if (!app.live) await app.refresh();
		toast.show(`Removed ${removed}`);
		// Last: with nobody selected, this whole section (and its dialog) goes away.
		app.setSelected([]);
	};
</script>

{#if canRemove || lockedPerson}
	<!-- Changes to people themselves, not to how they're viewed, so they sit apart from the rest. -->
	<div class="space-y-1 border-t border-accent/20 pt-1.5">
		<p class="eyebrow px-0.5">Manage</p>
		<div class="grid grid-cols-2 gap-1.5">
			{#if lockedPerson}
				<button
					class="btn btn-secondary btn-sm w-full"
					onclick={() => (passwordFor = lockedPerson)}
					title="Change or remove {lockedPerson.name}’s password"
				>
					<KeyRound class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					Password…
				</button>
			{/if}
			{#if canRemove}
				<button
					class="btn btn-secondary btn-sm w-full text-danger"
					onclick={() => (removeTargets = selectedPeople)}
					title="Remove {label(selectedPeople)} from this event"
				>
					<UserMinus class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					Remove…
				</button>
			{/if}
		</div>
	</div>
{/if}

{#if removeTargets}
	<ConfirmDialog
		title="Remove {label(removeTargets)}?"
		body="Their times and passwords are deleted from this event. Anyone can add the names again afterwards."
		confirmLabel="Remove"
		onconfirm={() => remove(removeTargets!)}
		onclose={() => (removeTargets = null)}
	/>
{/if}

{#if passwordFor}
	<PasswordDialog person={passwordFor} onclose={() => (passwordFor = null)} />
{/if}
