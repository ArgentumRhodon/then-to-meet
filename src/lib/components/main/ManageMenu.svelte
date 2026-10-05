<script lang="ts">
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
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
	import { toast } from '$lib/ui/toast.svelte';
	import TransferDialog from './TransferDialog.svelte';

	let open = $state(false);
	let deleting = $state(false);
	let transferring = $state(false);
	let updating = $state(false);

	/** Managing the event as a whole is for its owner; managing people is done from the people list. */
	const owner = $derived(app.event?.source === 'thentomeet' && accounts.owns(app.event));
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
			toast.show(e instanceof Error ? e.message : "Couldn't update from When2Meet. Try again.");
		} finally {
			updating = false;
		}
	};
</script>

{#if owner && app.event}
	<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
		<button
			class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
			onclick={() => (open = !open)}
			aria-haspopup="menu"
			aria-expanded={open}
			title="Manage this event"
		>
			<SlidersHorizontal class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
			Manage
		</button>
		{#if open}
			<div
				class="popover absolute top-full right-0 z-30 mt-1.5 w-60 p-1"
				role="menu"
				aria-label="Manage event"
				{@attach keepInView}
			>
				{#if app.event.importedFrom}
					<button
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
						role="menuitem"
						onclick={update}
					>
						<RefreshCw class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
						<span class="flex-1">
							<span class="block text-[13px]">Update from When2Meet</span>
							<span class="block text-[11px] text-fg-3"
								>New people and times; edits made here stay</span
							>
						</span>
					</button>
				{/if}
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
						<span class="block text-[13px]">Transfer ownership…</span>
						<span class="block text-[11px] text-fg-3">
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
						<span class="block text-[13px]">Delete event…</span>
						<span class="block text-[11px] text-fg-3">And everyone’s responses</span>
					</span>
				</button>
			</div>
		{/if}
	</div>

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
			onclose={() => (deleting = false)}
		/>
	{/if}

	{#if transferring}
		<TransferDialog candidates={heirs} onclose={() => (transferring = false)} />
	{/if}
{/if}
