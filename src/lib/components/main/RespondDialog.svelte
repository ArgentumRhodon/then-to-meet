<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Lock from '@lucide/svelte/icons/lock';
	import { onMount, untrack } from 'svelte';
	import { InvalidInput, PasswordRequired, responseKey, WrongPassword } from '$lib/events/model';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import AvailabilityPicker from './AvailabilityPicker.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const event = $derived(app.event!);
	const grid = $derived(app.grid!);

	let dialog = $state<HTMLDialogElement>();
	let name = $state(accounts.lastName || accounts.user?.name || '');
	let password = $state('');
	let selected = $state.raw<ReadonlySet<number>>(new Set());
	let busy = $state(false);
	let error = $state<string | null>(null);
	let passwordError = $state<string | null>(null);
	/** Whether this person has marked times by hand, which typing a known name then won't replace. */
	let dirty = false;
	let prefilledFor: number | null = null;

	onMount(() => dialog?.showModal());

	const key = $derived(name.trim() ? responseKey(name) : '');
	/** The person this name belongs to, as on When2Meet: the same name is the same person. */
	const existing = $derived(
		key ? [...event.people, ...event.noTimes].find((p) => responseKey(p.name) === key) : undefined
	);

	const slotsOf = (personId: number): Set<number> => {
		const slots = new Set<number>();
		event.slots.forEach((slot, i) => {
			if (slot.available.includes(personId)) slots.add(i);
		});
		return slots;
	};

	// Typing a name that's already there shows that person's times, ready to change.
	$effect(() => {
		const id = existing?.id ?? null;
		untrack(() => {
			if (id === prefilledFor) return;
			const hadPrefill = prefilledFor !== null;
			prefilledFor = id;
			if (dirty) return;
			if (id !== null) selected = slotsOf(id);
			else if (hadPrefill) selected = new Set();
		});
	});

	const setSelected = (next: Set<number>) => {
		dirty = true;
		selected = next;
	};

	const allSlots = () => new Set(event.slots.map((_, i) => i));

	const save = async (e: SubmitEvent) => {
		e.preventDefault();
		if (busy) return;
		error = passwordError = null;
		if (!name.trim()) {
			error = 'Enter your name.';
			return;
		}
		busy = true;
		try {
			const { personId } = await accounts.respond(event.id, {
				name,
				available: [...selected].map((i) => event.slots[i].time),
				password: password || undefined
			});
			accounts.lastName = name.trim();
			// Your own change isn't news to you; a live event already has it, and others are pulled.
			app.noteOwn(personId);
			if (!app.live) await app.refresh();
			toast.show(existing ? 'Times updated' : 'Times added');
			onclose();
		} catch (e) {
			if (e instanceof PasswordRequired || e instanceof WrongPassword) passwordError = e.message;
			else if (e instanceof InvalidInput) error = e.message;
			else if (e instanceof Error && e.name === 'NativeEventNotFound') error = e.message;
			else error = "Couldn't save your times. Check your connection and try again.";
		} finally {
			busy = false;
		}
	};
</script>

<dialog
	bind:this={dialog}
	class="m-auto flex max-h-[calc(100dvh-1.5rem)] w-[min(52rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel p-0 text-fg shadow-pop backdrop:bg-black/50"
	aria-labelledby="respond-title"
	{onclose}
	oncancel={(e) => {
		if (busy) e.preventDefault();
	}}
>
	<form class="flex min-h-0 flex-1 flex-col" onsubmit={save}>
		<header class="border-b border-line px-5 py-4">
			<h2 id="respond-title" class="text-base font-semibold tracking-tight">
				{existing ? `Edit ${existing.name}’s times` : 'Add your times'}
			</h2>
			<p class="mt-0.5 text-[13px] text-fg-2">
				Click or drag to mark when you’re free. Times are shown in {grid.zone.replaceAll('_', ' ')}.
			</p>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="respond-name" class="eyebrow mb-1.5 block">Your name</label>
					<input
						id="respond-name"
						class="input"
						type="text"
						autocomplete="name"
						maxlength="60"
						required
						bind:value={name}
					/>
					<p class="mt-1.5 text-xs text-fg-3">
						{#if existing}
							That name is already in this event, so you’re editing its times.
						{:else}
							Using a name that’s already here edits that person.
						{/if}
					</p>
				</div>
				<div>
					<label for="respond-password" class="eyebrow mb-1.5 flex items-center gap-1.5">
						Password
						{#if existing?.locked}
							<Lock class="size-3" aria-label="This name has a password" />
						{:else if !existing}
							<span class="font-normal normal-case">(optional)</span>
						{/if}
					</label>
					<input
						id="respond-password"
						class="input"
						type="password"
						autocomplete={existing?.locked ? 'current-password' : 'new-password'}
						maxlength="100"
						disabled={!!existing && !existing.locked}
						required={existing?.locked}
						aria-invalid={passwordError !== null}
						aria-describedby="respond-password-help"
						bind:value={password}
						oninput={() => (passwordError = null)}
					/>
					<p
						id="respond-password-help"
						class="mt-1.5 text-xs {passwordError ? 'text-danger' : 'text-fg-3'}"
					>
						{#if passwordError}
							{passwordError}
						{:else if existing?.locked}
							This name has a password. Enter it to change their times.
						{:else if existing}
							This name doesn’t have a password.
						{:else}
							Keeps others from changing your times. Not your account password; others with access
							to the event can’t see it, but don’t reuse one that matters.
						{/if}
					</p>
				</div>
			</div>

			<div class="mt-5">
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<span class="eyebrow">Availability</span>
					<span class="text-xs text-fg-3 tabular">
						{selected.size}
						{selected.size === 1 ? 'slot' : 'slots'} marked
					</span>
					<span class="ml-auto flex gap-1">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => setSelected(allSlots())}
							disabled={selected.size === event.slots.length}
						>
							Select all
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => setSelected(new Set())}
							disabled={selected.size === 0}
						>
							Clear
						</button>
					</span>
				</div>
				<AvailabilityPicker {grid} {selected} onchange={setSelected} />
			</div>
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
				{busy ? 'Saving…' : 'Save times'}
			</button>
		</footer>
	</form>
</dialog>
