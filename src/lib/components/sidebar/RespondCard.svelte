<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import { responseKey } from '$lib/events/model';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import RespondDialog from '../main/RespondDialog.svelte';

	const event = $derived(app.event!);
	let responding = $state(false);

	/**
	 * Who "you" are in this event: the entry your account responded under, or else the name you
	 * used on this visit.
	 */
	const you = $derived.by(() => {
		const all = [...event.people, ...event.noTimes];
		const uid = accounts.user?.uid;
		const mine = uid ? all.find((p) => p.uid === uid) : undefined;
		if (mine) return mine;
		const key = accounts.lastName.trim() ? responseKey(accounts.lastName) : '';
		return key ? all.find((p) => responseKey(p.name) === key) : undefined;
	});
	/** Whether you've marked any times; an entry without any is still asked to. */
	const answered = $derived(!!you && event.people.some((p) => p.id === you.id));
	const others = $derived(event.people.filter((p) => p.id !== you?.id).length);
</script>

<section class="border-b border-line p-4" aria-labelledby="respond-card-title">
	{#if you && answered}
		<div class="flex items-center gap-3">
			<Avatar id={you.id} name={you.name} size={32} />
			<h2 id="respond-card-title" class="min-w-0 flex-1 truncate text-13 font-medium">
				You’re in as {you.name}
			</h2>
			<button class="btn btn-secondary btn-sm" onclick={() => (responding = true)}>
				<Pencil class="size-3.5 text-fg-2" aria-hidden="true" />
				Edit times
			</button>
		</div>
	{:else}
		<div class="rounded-xl border border-accent/30 bg-accent-soft/50 p-4">
			<h2 id="respond-card-title" class="text-15 font-semibold tracking-tight">
				{you ? `${you.name}, you haven’t added any times` : 'When are you free?'}
			</h2>
			<p class="mt-1 text-13 text-fg-2">
				{#if others}
					{others}
					{others === 1 ? 'person has' : 'people have'} added their times. Add yours so the best times
					include you.
				{:else}
					Nobody has added times yet. Add yours to get things started.
				{/if}
				{#if !accounts.user}No account needed.{/if}
			</p>
			<button class="btn btn-primary mt-3 w-full" onclick={() => (responding = true)}>
				<Pencil class="size-4" aria-hidden="true" />
				Add your times
			</button>
		</div>
	{/if}
</section>

{#if responding}
	<RespondDialog startName={you?.name} onclose={() => (responding = false)} />
{/if}
