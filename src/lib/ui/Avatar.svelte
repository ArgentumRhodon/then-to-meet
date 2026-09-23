<script lang="ts">
	import { initials } from '$lib/analysis/format';

	let {
		id,
		name,
		size = 28,
		class: className = ''
	}: { id: number; name: string; size?: number; class?: string } = $props();

	// A stable hue per person, so someone keeps their color across reloads.
	const hue = $derived((id * 137.508) % 360);
	// Tiny avatars overlap in stacks, so they only fit one letter.
	const label = $derived(size < 20 ? initials(name)[0] : initials(name));
</script>

<span
	class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none {className}"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.38)}px"
	style:background="light-dark(hsl({hue} 70% 92%), hsl({hue} 30% 24%))"
	style:color="light-dark(hsl({hue} 45% 32%), hsl({hue} 70% 84%))"
	aria-hidden="true"
>
	{label}
</span>
