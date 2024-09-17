<script lang="ts">
	import '../app.postcss';
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
</script>

<AppShell>
	<svelte:fragment slot="header">
		<AppBar background="bg-warning-500">
			<p class="text-black text-lg">
				This website is in open beta and might have issues. Please submit any feedback at the
				<a class="underline" href="https://forms.gle/XV7RAXsSJfgE9EBJ8" target="_blank"
					>open beta feedback form</a
				>.
			</p>
		</AppBar>
	</svelte:fragment>
	<slot />
</AppShell>
