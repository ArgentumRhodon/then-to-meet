<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import X from '@lucide/svelte/icons/x';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte';

	/**
	 * The toast is a popover, so it sits in the browser's top layer, above an open dialog rather
	 * than behind its backdrop. Browsers without popovers just show it as a fixed bar.
	 */
	let layer = $state<HTMLElement>();
	/** Where focus was before it moved into the toast, to go back to when the toast goes. */
	let returnTo: HTMLElement | null = null;

	$effect(() => {
		const el = layer;
		if (!el?.showPopover) return;
		if (toast.message) {
			// Shown again for each message, which also lifts it above anything opened since.
			if (el.matches(':popover-open')) el.hidePopover();
			el.showPopover();
			return;
		}
		// Gone: after its exit animation.
		const timer = setTimeout(() => el.matches(':popover-open') && el.hidePopover(), 200);
		return () => clearTimeout(timer);
	});

	const dismiss = () => {
		const back = layer?.contains(document.activeElement) ? returnTo : null;
		toast.hide();
		back?.focus();
		returnTo = null;
	};
</script>

<!-- What screen readers hear, always in the page so they're listening before a message comes. -->
<p class="sr-only" role="status">{toast.spoken}</p>

<div
	bind:this={layer}
	popover="manual"
	class="pointer-events-none fixed inset-x-0 top-auto bottom-6 m-0 w-auto max-w-none overflow-visible border-0 bg-transparent p-0"
>
	<div class="flex justify-center px-4">
		{#if toast.message}
			<!-- A toast with a button holds still while it's pointed at or focused; Escape closes it. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex items-center gap-2 rounded-2xl bg-fg px-4 py-2 text-sm font-medium text-canvas shadow-pop {toast.action
					? 'pointer-events-auto py-1.5 pr-1.5'
					: ''}"
				transition:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : 160 }}
				onpointerenter={() => toast.pause()}
				onpointerleave={() => toast.resume()}
				onfocusin={(e) => {
					toast.pause();
					const from = e.relatedTarget;
					if (from instanceof HTMLElement && !layer?.contains(from)) returnTo = from;
				}}
				onfocusout={() => toast.resume()}
				onkeydown={(e) => {
					if (e.key !== 'Escape') return;
					// Used here, so the page doesn't also back out a step.
					e.preventDefault();
					dismiss();
				}}
			>
				{#if toast.error}
					<CircleAlert class="size-4 shrink-0" aria-hidden="true" />
				{:else}
					<Check class="size-4 shrink-0" aria-hidden="true" />
				{/if}
				{toast.message}
				{#if toast.action}
					<button
						class="ml-1 shrink-0 rounded-full px-2.5 py-0.5 font-semibold text-canvas hover:bg-canvas/15 pointer-coarse:px-3.5 pointer-coarse:py-2"
						onclick={() => {
							const { run } = toast.action!;
							dismiss();
							run();
						}}
					>
						{toast.action.label}
					</button>
					<button
						class="flex size-7 shrink-0 items-center justify-center rounded-full text-canvas hover:bg-canvas/15 pointer-coarse:size-9"
						onclick={dismiss}
						aria-label="Dismiss"
					>
						<X class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
