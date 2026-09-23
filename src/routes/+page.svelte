<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Landing from '$lib/components/Landing.svelte';
	import LoadingView from '$lib/components/LoadingView.svelte';
	import Workspace from '$lib/components/Workspace.svelte';
	import { readShareParams, shareSearch } from '$lib/share/url';
	import { app } from '$lib/state/app.svelte';

	// The URL is the source of truth for which event is open; everything else syncs back into it.
	afterNavigate(({ to }) => {
		const share = readShareParams(to?.url ?? page.url);
		if (!share.id) {
			app.reset();
		} else if (share.id !== app.event?.id) {
			app.load(share.id, share);
		}
	});

	// Keep the address bar shareable and remember this event's setup.
	$effect(() => {
		if (!app.event || app.status !== 'ready') return;
		const search = shareSearch(app.event.id, app.duration, app.effectiveRoles);
		if (search !== page.url.search) replaceState(search, page.state);
		app.persist();
	});

	const pendingId = $derived(readShareParams(page.url).id);
	const title = $derived(app.event ? `${app.event.title} · ThenToMeet` : 'ThenToMeet');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if app.event}
	<Workspace />
{:else if pendingId && app.status !== 'error'}
	<LoadingView />
{:else}
	<Landing />
{/if}
