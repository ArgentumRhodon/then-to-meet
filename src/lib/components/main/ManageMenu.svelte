<script lang="ts">
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import LogOut from '@lucide/svelte/icons/log-out';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { closeEvent } from '$lib/navigation';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';
	import { menu } from '$lib/ui/menu';
	import { toast } from '$lib/ui/toast.svelte';
	import TransferDialog from './TransferDialog.svelte';

	let open = $state(false);
	let deleting = $state(false);
	let transferring = $state(false);
	let updating = $state(false);
	let steppingDown = $state(false);
	let button = $state<HTMLButtonElement>();

	/**
	 * Dialogs opened from the menu hand focus back to its button: the item that opened them went
	 * with the menu, so the browser has nowhere to return it.
	 */
	const closed = (done: () => void) => () => {
		done();
		button?.focus();
	};

	/**
	 * Managing the event as a whole is for its owner and admins (admins can't delete or transfer it);
	 * managing people is done from the people list.
	 */
	const native = $derived(app.event?.source === 'thentomeet');
	const owner = $derived(native && !!app.event && accounts.owns(app.event));
	const admin = $derived(native && !!app.event && accounts.administers(app.event));
	/** Accounts that could take over: signed in when they responded, and not the owner already. */
	const heirs = $derived(
		app.event
			? [...app.event.people, ...app.event.noTimes].filter(
					(p) => p.uid && p.uid !== app.event!.ownerId
				)
			: []
	);

	/** Pulls the When2Meet poll's changes into an imported copy. */
	const update = async () => {
		if (updating) return;
		open = false;
		updating = true;
		try {
			const { added, updated, kept, slotsAdded } = await app.resyncImport();
			const parts = [
				added && `${added} added`,
				updated && `${updated} updated`,
				slotsAdded && `${slotsAdded} new ${slotsAdded === 1 ? 'time' : 'times'}`
			].filter(Boolean);
			const left = kept ? ` ${kept} changed here, so left as they were.` : '';
			toast.show(
				parts.length
					? `Updated from When2Meet: ${parts.join(', ')}.${left}`
					: `Already up to date.${left}`
			);
		} catch (e) {
			toast.fail(e instanceof Error ? e.message : "Couldn't update from When2Meet. Try again.");
		} finally {
			updating = false;
		}
	};
</script>

{#if (owner || admin) && app.event}
	<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
		<button
			class="btn btn-secondary h-8 gap-1.5 px-2.5 text-13"
			onclick={() => (open = !open)}
			aria-haspopup="menu"
			bind:this={button}
			aria-expanded={open}
			title="Manage this event"
		>
			<SlidersHorizontal class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
			Manage
		</button>
		{#if open}
			<div
				class="popover absolute top-full right-0 z-30 mt-1.5 max-h-[calc(100dvh-8rem)] w-60 overflow-y-auto p-1"
				role="menu"
				aria-label="Manage event"
				{@attach keepInView}
				{@attach menu(() => (open = false))}
			>
				{#if app.event.importedFrom}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
						role="menuitem"
						onclick={update}
					>
						<RefreshCw class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
						<span class="flex-1">
							<span class="block text-13">Update from When2Meet</span>
							<span class="block text-11 text-fg-3">New people and times; edits made here stay</span
							>
						</span>
					</button>
				{/if}
				{#if admin}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
						role="menuitem"
						onclick={() => {
							open = false;
							steppingDown = true;
						}}
					>
						<LogOut class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
						<span class="flex-1">
							<span class="block text-13">Step down as admin…</span>
							<span class="block text-11 text-fg-3">Only the owner can make you one again</span>
						</span>
					</button>
				{/if}
				{#if owner}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle disabled:opacity-50 disabled:hover:bg-transparent pointer-coarse:py-2.5"
						role="menuitem"
						disabled={!heirs.length}
						onclick={() => {
							open = false;
							transferring = true;
						}}
					>
						<ArrowRightLeft
							class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5"
							aria-hidden="true"
						/>
						<span class="flex-1">
							<span class="block text-13">Transfer ownership…</span>
							<span class="block text-11 text-fg-3">
								{heirs.length
									? 'Hand the event to someone else'
									: 'Needs someone signed in who’s responded'}
							</span>
						</span>
					</button>
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-danger hover:bg-subtle pointer-coarse:py-2.5"
						role="menuitem"
						onclick={() => {
							open = false;
							deleting = true;
						}}
					>
						<Trash2 class="size-4 shrink-0 pointer-coarse:size-5" aria-hidden="true" />
						<span class="flex-1">
							<span class="block text-13">Delete event…</span>
							<span class="block text-11 text-fg-3">And everyone’s responses</span>
						</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if steppingDown}
		<ConfirmDialog
			title="Step down as admin?"
			body="You’ll keep your own times here, but won’t be able to manage the event or its people. Only the owner can make you an admin again."
			confirmLabel="Step down"
			onconfirm={async () => {
				await accounts.setAdmin(app.event!.id, accounts.user!.uid, false);
				if (!app.live) await app.refresh();
				toast.show('You’re no longer an admin of this event');
			}}
			onclose={closed(() => (steppingDown = false))}
		/>
	{/if}

	{#if deleting}
		<ConfirmDialog
			title="Delete “{app.event.title}”?"
			body="The event and everyone’s times are deleted for good. Anyone with the link will find nothing there."
			confirmLabel="Delete event"
			onconfirm={async () => {
				const id = app.event!.id;
				await accounts.deleteEvent(id);
				recent.forget(id);
				toast.show('Event deleted');
				await closeEvent();
			}}
			onclose={closed(() => (deleting = false))}
		/>
	{/if}

	{#if transferring}
		<TransferDialog candidates={heirs} onclose={closed(() => (transferring = false))} />
	{/if}
{/if}
