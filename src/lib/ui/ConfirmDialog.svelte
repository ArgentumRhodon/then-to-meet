<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';

	let {
		title,
		body,
		confirmLabel,
		onconfirm,
		onclose
	}: {
		title: string;
		body: string;
		confirmLabel: string;
		/** Does the thing. If it throws, the message is shown and the dialog stays open. */
		onconfirm: () => Promise<void>;
		onclose: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(() => dialog?.showModal());

	const confirm = async () => {
		if (busy) return;
		busy = true;
		error = null;
		try {
			await onconfirm();
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
	aria-labelledby="confirm-title"
	aria-describedby="confirm-body"
	{onclose}
	oncancel={(e) => {
		if (busy) e.preventDefault();
	}}
>
	<div class="px-5 pt-5 pb-4">
		<h2 id="confirm-title" class="text-base font-semibold tracking-tight">{title}</h2>
		<p id="confirm-body" class="mt-1.5 text-sm text-fg-2">{body}</p>
		{#if error}
			<p class="mt-3 flex items-start gap-1.5 text-[13px] text-danger" role="alert">
				<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>{error}</span>
			</p>
		{/if}
	</div>
	<div class="flex justify-end gap-2 border-t border-line px-5 py-3">
		<button type="button" class="btn btn-secondary" onclick={() => dialog?.close()} disabled={busy}>
			Cancel
		</button>
		<button
			type="button"
			class="btn bg-danger text-white hover:opacity-90"
			onclick={confirm}
			disabled={busy}
		>
			{busy ? 'Working…' : confirmLabel}
		</button>
	</div>
</dialog>
