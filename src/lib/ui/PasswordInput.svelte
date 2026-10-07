<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/** A password field with a button to show what was typed. Takes the attributes an input does. */
	let {
		value = $bindable(''),
		...rest
	}: Omit<HTMLInputAttributes, 'type' | 'value' | 'class'> & { value?: string } = $props();

	let shown = $state(false);
</script>

<div class="relative">
	<input {...rest} class="input pr-11" type={shown ? 'text' : 'password'} bind:value />
	<!-- The name stays the same and the pressed state says which way it's set. -->
	<button
		type="button"
		class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-fg-3 outline-offset-[-2px] hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:w-11"
		aria-label="Show password"
		aria-pressed={shown}
		disabled={rest.disabled ?? false}
		onclick={() => (shown = !shown)}
	>
		{#if shown}
			<EyeOff class="size-4" aria-hidden="true" />
		{:else}
			<Eye class="size-4" aria-hidden="true" />
		{/if}
	</button>
</div>
