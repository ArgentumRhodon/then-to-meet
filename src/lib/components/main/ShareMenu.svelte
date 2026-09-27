<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Link from '@lucide/svelte/icons/link';
	import Share2 from '@lucide/svelte/icons/share-2';
	import { page } from '$app/state';
	import { buildSummary } from '$lib/share/summary';
	import { app } from '$lib/state/app.svelte';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';
	import { copyText } from '$lib/ui/toast.svelte';

	let open = $state(false);

	const link = () => app.shareLink(page.url.origin);

	const copyLink = () => {
		copyText(link(), 'Link copied');
		open = false;
	};

	const copySummary = () => {
		if (!app.event || !app.best || !app.grid) return;
		copyText(
			buildSummary({
				event: app.event,
				best: app.best,
				sets: app.meetingSets,
				perWeek: app.perWeek,
				duration: app.duration,
				zone: app.grid.zone,
				group: app.groupLabel ?? undefined,
				link: link()
			}),
			'Summary copied'
		);
		open = false;
	};
</script>

<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="btn btn-primary h-8 px-3 text-[13px]"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
	>
		<Share2 class="size-3.5" aria-hidden="true" />
		Share
	</button>
	{#if open}
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-72 p-1"
			role="menu"
			{@attach keepInView}
		>
			<button
				class="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-subtle"
				role="menuitem"
				onclick={copyLink}
			>
				<Link class="mt-0.5 size-4 shrink-0 text-fg-2" aria-hidden="true" />
				<span>
					<span class="block text-[13px] font-medium">Copy link</span>
					<span class="block text-xs text-fg-3"
						>Opens this event with your roles and meeting length{app.selection.length
							? `, and your picked time${app.selection.length > 1 ? 's' : ''}`
							: ''}.</span
					>
				</span>
			</button>
			<button
				class="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-subtle"
				role="menuitem"
				onclick={copySummary}
			>
				<FileText class="mt-0.5 size-4 shrink-0 text-fg-2" aria-hidden="true" />
				<span>
					<span class="block text-[13px] font-medium">Copy summary</span>
					<span class="block text-xs text-fg-3"
						>The best times as text for Slack, Discord, or email.</span
					>
				</span>
			</button>
		</div>
	{/if}
</div>
