<script lang="ts">
	import '../app.css';
	import { onMount, untrack } from 'svelte';
	import { accounts } from '$lib/state/accounts.svelte';
	import { syncAccount } from '$lib/state/session';
	import Toaster from '$lib/ui/Toaster.svelte';

	let { children } = $props();

	onMount(() => accounts.init());

	// Follow sign-in and sign-out, once Firebase has said who's there.
	$effect(() => {
		if (!accounts.resolved) return;
		const uid = accounts.user?.uid ?? null;
		untrack(() => syncAccount(uid));
	});
</script>

{@render children()}
<Toaster />
