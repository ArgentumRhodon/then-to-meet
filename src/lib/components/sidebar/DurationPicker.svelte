<script lang="ts">
	import { DURATIONS } from '$lib/analysis/duration';
	import { formatDuration } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
</script>

<div class="space-y-1.5">
	<span id="duration-label" class="block text-[13px] text-fg-2">Meeting length</span>
	<div
		class="grid grid-cols-6 rounded-lg bg-subtle p-0.5"
		role="group"
		aria-labelledby="duration-label"
	>
		{#each DURATIONS as minutes (minutes)}
			<button
				class="h-7 rounded-md text-xs font-medium whitespace-nowrap tabular transition-colors pointer-coarse:h-9 {app.duration ===
				minutes
					? 'bg-accent text-on-accent'
					: 'text-fg-2 hover:text-fg'}"
				aria-pressed={app.duration === minutes}
				onclick={() => app.setDuration(minutes)}
			>
				{formatDuration(minutes)}
			</button>
		{/each}
	</div>
</div>
