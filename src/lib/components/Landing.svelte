<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Share from '@lucide/svelte/icons/share';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import { openEvent } from '$lib/navigation';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import SettingsMenu from '$lib/ui/SettingsMenu.svelte';
	import { DEMO_ID } from '$lib/w2m/id';
	import LinkInput from './LinkInput.svelte';
	import MyEvents from './MyEvents.svelte';
	import RecentList from './RecentList.svelte';

	const features = [
		{
			icon: UserCheck,
			title: "Choose who's required",
			body: 'Mark who has to be there, who would be nice to have, and who to skip.'
		},
		{
			icon: ListOrdered,
			title: 'Find the best times',
			body: 'See every window that fits your meeting needs, plus near misses.'
		},
		{
			icon: Share,
			title: 'Share the results',
			body: "Once you've found a meeting time that works for you, share it with others or add it to your calendar."
		}
	];
</script>

<div class="flex min-h-dvh flex-col">
	<header class="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
		<span class="text-[15px] font-semibold tracking-tight">ThenToMeet</span>
		<SettingsMenu />
	</header>

	<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pt-10 pb-16 sm:pt-20">
		<div class="mx-auto w-full max-w-xl text-center">
			<h1
				class="text-3xl font-semibold tracking-tight text-balance sm:text-[40px] sm:leading-[1.1]"
			>
				Find the time that actually works
			</h1>
			<p class="mt-4 text-base text-pretty text-fg-2">
				Paste a When2Meet link to choose who’s required, rank the best meeting times, and share the
				result.
			</p>
		</div>

		<div class="mx-auto mt-8 w-full max-w-xl">
			<LinkInput size="lg" autofocus onsubmit={openEvent} />
			{#if app.error}
				<div
					class="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger"
					role="alert"
				>
					<CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<span>{app.error}</span>
				</div>
			{/if}
			<p class="mt-3 text-center text-sm text-fg-3">
				No link handy?
				<button
					class="font-medium text-accent-fg underline-offset-4 hover:underline pointer-coarse:py-2"
					onclick={() => openEvent(DEMO_ID)}
				>
					Try a demo event
				</button>
				{#if accounts.enabled}
					<span class="mx-1 text-fg-3" aria-hidden="true">·</span>
					<a
						class="font-medium text-accent-fg underline-offset-4 hover:underline pointer-coarse:py-2"
						href="/new"
					>
						Create your own
					</a>
				{/if}
			</p>
		</div>

		<MyEvents onopen={openEvent} />

		{#if recent.items.length}
			<section class="mx-auto mt-10 w-full max-w-xl" aria-labelledby="recent-heading">
				<h2 id="recent-heading" class="eyebrow mb-2 px-3">Recent events</h2>
				<div class="card p-1.5">
					<RecentList onopen={openEvent} limit={6} />
				</div>
			</section>
		{/if}

		<section class="mt-16 grid gap-4 sm:grid-cols-3" aria-label="Features">
			{#each features as feature (feature.title)}
				<div class="card p-5">
					<div
						class="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-fg"
					>
						<feature.icon class="size-[18px]" aria-hidden="true" />
					</div>
					<h3 class="mt-4 text-sm font-semibold">{feature.title}</h3>
					<p class="mt-1.5 text-sm text-fg-2">{feature.body}</p>
				</div>
			{/each}
		</section>
	</main>

	<footer class="mx-auto w-full max-w-5xl px-5 py-6 text-xs text-fg-3">
		ThenToMeet reads public When2Meet polls. It isn’t affiliated with When2Meet.
	</footer>
</div>
