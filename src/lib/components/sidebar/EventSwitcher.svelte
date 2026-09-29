<script lang="ts">
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import { openEvent } from '$lib/navigation';
	import { app } from '$lib/state/app.svelte';
	import { recent } from '$lib/state/recent.svelte';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';
	import LinkInput from '../LinkInput.svelte';
	import RecentList from '../RecentList.svelte';

	let open = $state(false);

	const go = (id: string) => {
		open = false;
		openEvent(id);
	};

	const others = $derived(recent.items.filter((e) => e.id !== app.event?.id).length);
</script>

<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="btn btn-secondary h-8 px-2.5 text-[13px]"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="dialog"
		title="Open another event"
	>
		<ArrowLeftRight class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
		Events
	</button>
	{#if open}
		<!-- Hangs left from the button in the top bar of narrow screens, and right from the top of
		     the sidebar in the wide layout. -->
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-[min(20rem,calc(100vw-2rem))] p-3 lg:right-auto lg:left-0"
			role="dialog"
			{@attach keepInView}
			aria-label="Open another event"
		>
			<p class="mb-2 text-xs font-medium text-fg-2">Paste another When2Meet link</p>
			<LinkInput onsubmit={go} autofocus />
			{#if others}
				<p class="eyebrow mt-4 mb-1 px-3">Recent</p>
				<div class="-mx-1.5 max-h-72 overflow-y-auto">
					<RecentList onopen={go} currentId={app.event?.id ?? null} />
				</div>
			{/if}
		</div>
	{/if}
</div>
