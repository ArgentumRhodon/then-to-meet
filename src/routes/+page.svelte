<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import Landing from '$lib/components/Landing.svelte';
	import LoadingView from '$lib/components/LoadingView.svelte';
	import Workspace from '$lib/components/Workspace.svelte';
	import { readShareParams } from '$lib/share/url';
	import { app } from '$lib/state/app.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The URL is the source of truth for which event is open; everything else syncs back into it.
	afterNavigate(({ to }) => {
		const share = readShareParams(to?.url ?? page.url);
		if (!share.id) {
			app.reset();
		} else if (share.id !== app.event?.id) {
			// On a first page load the server has usually fetched the event already.
			app.load(share.id, { ...share, event: data.event });
		}
	});

	// Keep the address bar shareable and remember this event's setup. The URL is read untracked:
	// navigating away changes it before afterNavigate closes the event, and rerunning then would
	// write the old event's link back over the new page's.
	$effect(() => {
		if (!app.event || app.status !== 'ready') return;
		const search = app.search();
		untrack(() => {
			if (search !== page.url.search) replaceState(search, page.state);
		});
		app.persist();
	});

	const pendingId = $derived(readShareParams(page.url).id);
	const name = $derived(app.event?.title ?? data.preview?.title);
	const title = $derived(name ? `${name} · ThenToMeet` : 'ThenToMeet');
</script>

<svelte:head>
	<title>{title}</title>
	<meta property="og:site_name" content="ThenToMeet" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={data.preview?.title ?? 'ThenToMeet'} />
	<meta
		property="og:description"
		content={data.preview?.description ??
			'Find the best time to meet from any When2Meet poll: rank times, mark who’s required, and share the result.'}
	/>
	<meta name="twitter:card" content="summary" />
</svelte:head>

{#if app.event}
	<Workspace />
{:else if pendingId && app.status !== 'error'}
	<LoadingView />
{:else}
	<Landing />
{/if}
