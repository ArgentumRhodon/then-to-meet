<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import type { Person } from '$lib/types';

	let { candidates, onclose }: { candidates: Person[]; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let chosen = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(() => dialog?.showModal());

	const target = $derived(candidates.find((p) => p.uid === chosen));

	const transfer = async (e: SubmitEvent) => {
		e.preventDefault();
		if (busy || !target?.uid) return;
		busy = true;
		error = null;
		try {
			await accounts.transferOwnership(app.event!.id, target.uid);
			if (!app.live) await app.refresh();
			toast.show(`${target.name} now owns this event`);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong. Try again.';
		} finally {
			busy = false;
		}
	};
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-panel p-0 text-fg shadow-pop backdrop:bg-black/50"
	aria-labelledby="transfer-title"
	{onclose}
	oncancel={(e) => {
		if (busy) e.preventDefault();
	}}
>
	<form onsubmit={transfer}>
		<header class="border-b border-line px-5 py-4">
			<h2 id="transfer-title" class="text-base font-semibold tracking-tight">Transfer ownership</h2>
			<p class="mt-0.5 text-13 text-fg-2">
				Pick who takes over. They can delete the event and remove people, and you can’t, unless they
				hand it back.
			</p>
		</header>

		<fieldset class="max-h-72 space-y-0.5 overflow-y-auto px-3 py-3">
			<legend class="sr-only">New owner</legend>
			{#each candidates as person (person.id)}
				<label
					class="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-subtle has-checked:bg-accent-soft"
				>
					<input type="radio" name="new-owner" value={person.uid} bind:group={chosen} />
					<Avatar id={person.id} name={person.name} size={28} />
					<span class="min-w-0 flex-1 truncate text-sm">{person.name}</span>
				</label>
			{/each}
			<p class="px-2.5 pt-2 text-xs text-fg-3">
				Only people who were signed in when they added their times are listed.
			</p>
		</fieldset>

		<footer class="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
			{#if error}
				<p class="flex min-w-0 flex-1 items-start gap-1.5 text-13 text-danger" role="alert">
					<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span>{error}</span>
				</p>
			{:else}
				<span class="flex-1"></span>
			{/if}
			<button
				type="button"
				class="btn btn-secondary"
				onclick={() => dialog?.close()}
				disabled={busy}
			>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={busy || !target}>
				{busy ? 'Transferring…' : target ? `Make ${target.name} the owner` : 'Transfer'}
			</button>
		</footer>
	</form>
</dialog>
