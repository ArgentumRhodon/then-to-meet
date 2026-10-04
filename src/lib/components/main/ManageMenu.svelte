<script lang="ts">
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { closeEvent } from '$lib/navigation';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';
	import { toast } from '$lib/ui/toast.svelte';

	let open = $state(false);
	let deleting = $state(false);

	/** Managing the event as a whole is for its owner; managing people is done from the people list. */
	const owner = $derived(app.event?.source === 'thentomeet' && accounts.owns(app.event));
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
				await accounts.deleteEvent(app.event!.id);
				toast.show('Event deleted');
				await closeEvent();
			}}
			onclose={() => (deleting = false)}
		/>
	{/if}
{/if}
