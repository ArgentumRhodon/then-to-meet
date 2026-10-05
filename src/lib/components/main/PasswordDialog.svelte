<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { InvalidInput, PasswordRequired, WrongPassword } from '$lib/events/model';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import type { Person } from '$lib/types';
	import { toast } from '$lib/ui/toast.svelte';

	let { person, onclose }: { person: Person; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let current = $state('');
	let next = $state('');
	let remove = $state(false);
	let busy = $state(false);
	let currentError = $state<string | null>(null);
	let error = $state<string | null>(null);

	onMount(() => dialog?.showModal());

	const save = async (e: SubmitEvent) => {
		e.preventDefault();
		if (busy) return;
		currentError = error = null;
		if (!remove && !next) {
			error = 'Enter a new password, or choose to remove it.';
			return;
		}
		busy = true;
		try {
			const id = app.event!.id;
			if (remove) await accounts.removePassword(id, person.name, current);
			else await accounts.changePassword(id, person.name, current, next);
			if (!app.live) await app.refresh();
			toast.show(remove ? 'Password removed' : 'Password changed');
			onclose();
		} catch (e) {
			if (e instanceof PasswordRequired || e instanceof WrongPassword) currentError = e.message;
			else error = e instanceof InvalidInput || e instanceof Error ? e.message : 'Try again.';
		} finally {
			busy = false;
		}
	};
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-panel p-0 text-fg shadow-pop backdrop:bg-black/50"
	aria-labelledby="password-title"
	{onclose}
	oncancel={(e) => {
		if (busy) e.preventDefault();
	}}
>
	<form onsubmit={save}>
		<header class="border-b border-line px-5 py-4">
			<h2 id="password-title" class="text-base font-semibold tracking-tight">
				Password for {person.name}
			</h2>
			<p class="mt-0.5 text-[13px] text-fg-2">
				Change it, or take it off. You need the current one.
			</p>
		</header>

		<div class="space-y-4 px-5 py-4">
			<div>
				<label for="password-current" class="eyebrow mb-1.5 block">Current password</label>
				<input
					id="password-current"
					class="input"
					type="password"
					autocomplete="current-password"
					maxlength="100"
					required
					aria-invalid={currentError !== null}
					aria-describedby="password-current-error"
					bind:value={current}
					oninput={() => (currentError = null)}
				/>
				{#if currentError}
					<p id="password-current-error" class="mt-1.5 text-xs text-danger">{currentError}</p>
				{/if}
			</div>

			<div>
				<label for="password-new" class="eyebrow mb-1.5 block">New password</label>
				<input
					id="password-new"
					class="input"
					type="password"
					autocomplete="new-password"
					maxlength="100"
					disabled={remove}
					bind:value={next}
				/>
			</div>

			<label class="flex items-start gap-2 text-[13px]">
				<input
					class="mt-0.5"
					type="checkbox"
					bind:checked={remove}
					onchange={() => remove && (next = '')}
				/>
				<span>
					Remove the password
					<span class="block text-xs text-fg-3">
						Anyone could then change this name’s times, and it can’t be protected again.
					</span>
				</span>
			</label>
		</div>

		<footer class="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
			{#if error}
				<p class="flex min-w-0 flex-1 items-start gap-1.5 text-[13px] text-danger" role="alert">
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
			<button type="submit" class="btn btn-primary" disabled={busy}>
				{busy ? 'Saving…' : remove ? 'Remove password' : 'Change password'}
			</button>
		</footer>
	</form>
</dialog>
