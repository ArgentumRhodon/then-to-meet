<script lang="ts">
	import '../app.postcss';
	import { AppShell } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	import { info } from '$lib';
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

    $:title = $info?.title ? `${$info.title} - ThenToMeet` : 'ThenToMeet';
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<AppShell>
	<slot />
</AppShell>
