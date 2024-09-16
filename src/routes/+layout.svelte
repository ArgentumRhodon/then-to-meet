<script lang="ts">
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
</script>

<!-- App Shell -->
<AppShell>
	<svelte:fragment slot="header">
		<!-- App Bar -->
		<!-- <AppBar shadow="shadow-2xl">
			<svelte:fragment slot="lead">
				<h1>
					<strong class="text-xl uppercase">Then-To-Meet</strong>
				</h1>
			</svelte:fragment>
			<svelte:fragment slot="trail"></svelte:fragment>
		</AppBar> -->
	</svelte:fragment>
	<!-- Page Route Content -->
	<slot />
</AppShell>
