<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { extractAnyEventId } from '$lib/events/id';

	let {
		onsubmit,
		size = 'md',
		autofocus = false
	}: { onsubmit: (id: string) => void; size?: 'md' | 'lg'; autofocus?: boolean } = $props();

	let value = $state('');
	let invalid = $state(false);
	const hintId = $props.id();

	const submit = (raw: string) => {
		const id = extractAnyEventId(raw);
		invalid = !id;
		if (id) {
			value = '';
			onsubmit(id);
		}
	};

	// Focus on mount, but not on touch screens where it would pop up the keyboard.
	const focusIfFine = (node: HTMLInputElement) => {
		if (autofocus && matchMedia('(pointer: fine)').matches) node.focus();
	};

	// Loading on paste saves a click in the common case.
	const onpaste = (e: ClipboardEvent) => {
		const text = e.clipboardData?.getData('text') ?? '';
		if (extractAnyEventId(text)) {
			e.preventDefault();
			submit(text);
		}
	};
</script>

<form
	class="space-y-1.5"
	onsubmit={(e) => {
		e.preventDefault();
		submit(value);
	}}
>
	<div class="flex gap-2">
		<label for="{hintId}-input" class="sr-only">When2Meet link</label>
		<input
			id="{hintId}-input"
			class="input {size === 'lg' ? 'h-12 px-4 text-base' : ''}"
			type="text"
			inputmode="url"
			autocomplete="off"
			spellcheck="false"
			placeholder="when2meet.com/?12345678-AbCdE"
			aria-invalid={invalid}
			aria-describedby={invalid ? `${hintId}-error` : undefined}
			{@attach focusIfFine}
			bind:value
			oninput={() => (invalid = false)}
			{onpaste}
		/>
		<button class="btn btn-primary {size === 'lg' ? 'h-12 px-5 text-base' : ''}" type="submit">
			Load
			<ArrowRight class="size-4 pointer-coarse:size-5" aria-hidden="true" />
		</button>
	</div>
	{#if invalid}
		<p id="{hintId}-error" class="text-xs text-danger">
			Paste a When2Meet link or event ID, like when2meet.com/?12345678-AbCdE
		</p>
	{/if}
</form>
