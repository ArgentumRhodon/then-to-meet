<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { formatMinuteOfDay, formatZone } from '$lib/analysis/format';
	import DatePicker from '$lib/components/new/DatePicker.svelte';
	import { InvalidInput, parseNewEvent } from '$lib/events/model';
	import { buildSlots } from '$lib/events/slots';
	import { openEvent } from '$lib/navigation';
	import { accounts } from '$lib/state/accounts.svelte';
	import SettingsMenu from '$lib/ui/SettingsMenu.svelte';

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const SLOT_LENGTHS = [
		{ seconds: 900, label: '15 minutes' },
		{ seconds: 1800, label: '30 minutes' },
		{ seconds: 3600, label: '1 hour' }
	];

	let title = $state('');
	let kind = $state<'dates' | 'weekly'>('dates');
	let dates = $state.raw<string[]>([]);
	let weekdays = $state.raw<number[]>([]);
	let startHour = $state(9);
	let endHour = $state(17);
	let slotSeconds = $state(1800);
	let zone = $state('UTC');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// The visitor's own timezone, which a server render can't know.
	onMount(() => (zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));

	const hourLabel = (hour: number) => (hour % 24 === 0 ? 'Midnight' : formatMinuteOfDay(hour * 60));

	/** The slots these choices make, or what's wrong with them (shown as a hint, not an error). */
	const plan = $derived.by(() => {
		try {
			const slots = buildSlots({
				weekly: kind === 'weekly',
				dates,
				weekdays,
				startHour,
				endHour,
				slotSeconds,
				zone
			});
			return { slots, problem: null };
		} catch (e) {
			return { slots: null, problem: e instanceof InvalidInput ? e.message : String(e) };
		}
	});

	const days = $derived(kind === 'weekly' ? weekdays.length : dates.length);

	const toggleWeekday = (day: number) =>
		(weekdays = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]);

	const create = async (e: SubmitEvent) => {
		e.preventDefault();
		if (busy) return;
		error = null;
		busy = true;
		try {
			const input = parseNewEvent({
				title,
				weekly: kind === 'weekly',
				slotSeconds,
				slots: plan.slots ?? []
			});
			// Creating needs an account, since it makes you the owner, so sign in first if need be.
			if (!accounts.user && !(await accounts.signIn())) return;
			await openEvent(await accounts.createEvent(input));
		} catch (e) {
			error =
				e instanceof InvalidInput
					? e.message
					: "Couldn't create the event. Check your connection and try again.";
		} finally {
			busy = false;
		}
	};
</script>

<svelte:head>
	<title>New event · ThenToMeet</title>
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
		<a href="/" class="inline-flex h-10 items-center text-15 font-semibold tracking-tight"
			>ThenToMeet</a
		>
		<SettingsMenu />
	</header>

	<main class="mx-auto w-full max-w-2xl flex-1 px-5 pt-6 pb-16 sm:pt-10">
		<h1 class="text-2xl font-semibold tracking-tight">Create an event</h1>
		<p class="mt-1.5 text-fg-2">
			Pick the days and hours, then share the link. Anyone with it can add their times, no account
			needed.
		</p>

		{#if !accounts.enabled}
			<div class="card mt-8 p-5 text-sm text-fg-2">
				Accounts aren’t set up on this ThenToMeet, so events can’t be created here. Paste a
				When2Meet link on the <a class="text-accent-fg underline underline-offset-4" href="/"
					>start page</a
				>
				instead.
			</div>
		{:else}
			<form class="mt-8 space-y-7" onsubmit={create}>
				<div>
					<label for="event-title" class="eyebrow mb-1.5 block text-fg-2">Event name</label>
					<input
						id="event-title"
						class="input"
						type="text"
						maxlength="120"
						placeholder="Design team sync"
						required
						bind:value={title}
					/>
				</div>

				<fieldset>
					<legend class="eyebrow mb-1.5 text-fg-2">Which days?</legend>
					<div
						class="inline-flex rounded-lg border border-line bg-surface p-0.5"
						role="radiogroup"
						aria-label="Kind of event"
					>
						{#each [{ value: 'dates', label: 'Specific dates' }, { value: 'weekly', label: 'Days of the week' }] as option (option.value)}
							<label
								class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors not-has-[:checked]:text-fg-2 not-has-[:checked]:hover:text-fg has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-surface light:has-[:checked]:ring-1 light:has-[:checked]:ring-accent-strong"
							>
								<input
									class="sr-only"
									type="radio"
									name="kind"
									value={option.value}
									bind:group={kind}
								/>
								{option.label}
							</label>
						{/each}
					</div>

					<div class="mt-4">
						{#if kind === 'dates'}
							<div class="card max-w-xs p-3">
								<DatePicker selected={dates} onchange={(next) => (dates = next)} />
							</div>
						{:else}
							<div class="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
								{#each WEEKDAYS as label, day (day)}
									<button
										type="button"
										class="btn {weekdays.includes(day)
											? 'btn-primary light:ring-1 light:ring-accent-strong'
											: 'btn-secondary'} w-14"
										aria-pressed={weekdays.includes(day)}
										onclick={() => toggleWeekday(day)}
									>
										{label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</fieldset>

				<fieldset>
					<legend class="eyebrow mb-1.5 text-fg-2">Which times?</legend>
					<div class="grid gap-3 sm:grid-cols-3">
						<div>
							<label for="start-hour" class="mb-1 block text-xs text-fg-2">No earlier than</label>
							<select id="start-hour" class="input" bind:value={startHour}>
								{#each Array.from({ length: 24 }, (_, h) => h) as hour (hour)}
									<option value={hour}>{hourLabel(hour)}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="end-hour" class="mb-1 block text-xs text-fg-2">No later than</label>
							<select id="end-hour" class="input" bind:value={endHour}>
								{#each Array.from({ length: 24 }, (_, h) => h + 1) as hour (hour)}
									<option value={hour}>{hourLabel(hour)}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="slot-length" class="mb-1 block text-xs text-fg-2">Slot length</label>
							<select id="slot-length" class="input" bind:value={slotSeconds}>
								{#each SLOT_LENGTHS as length (length.seconds)}
									<option value={length.seconds}>{length.label}</option>
								{/each}
							</select>
						</div>
					</div>
					<p class="mt-2 text-xs text-fg-2">
						{#if kind === 'weekly'}
							Weekly events have no timezone: everyone sees the same times.
						{:else}
							Times are in {formatZone(zone)}. Everyone sees them in their own timezone.
						{/if}
					</p>
				</fieldset>

				<div class="flex flex-wrap items-center gap-3 border-t border-line pt-5">
					<p
						id="plan-summary"
						class="min-w-0 flex-1 text-sm {plan.problem && days ? 'text-warn' : 'text-fg-2'}"
						aria-live="polite"
					>
						{#if plan.slots}
							{days}
							{kind === 'weekly' ? (days === 1 ? 'day' : 'days') : days === 1 ? 'date' : 'dates'}, {plan
								.slots.length}
							slots
						{:else if days}
							{plan.problem}
						{:else}
							{kind === 'weekly' ? 'Pick at least one day.' : 'Pick at least one date.'}
						{/if}
					</p>
					<button
						type="submit"
						class="btn btn-primary h-10 px-5"
						disabled={busy || !plan.slots || !title.trim()}
						aria-describedby="plan-summary"
					>
						{busy ? 'Creating…' : accounts.user ? 'Create event' : 'Sign in to create'}
					</button>
				</div>

				{#if error}
					<div
						class="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger"
						role="alert"
					>
						<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<span>{error}</span>
					</div>
				{/if}
			</form>
		{/if}
	</main>
</div>
