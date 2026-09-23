<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { formatDuration } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';

	const PRESETS = [15, 30, 45, 60, 90, 120];
</script>

<div class="space-y-2.5">
	<div class="flex items-center gap-2">
		<span id="duration-label" class="text-[13px] text-fg-2">Meeting length</span>
		<div
			class="ml-auto flex h-8 items-center rounded-lg border border-line bg-surface"
			role="group"
			aria-labelledby="duration-label"
		>
			<button
				class="flex h-full w-8 items-center justify-center rounded-l-lg text-fg-2 hover:bg-subtle hover:text-fg disabled:opacity-40"
				onclick={() => app.setDuration(app.duration - 15)}
				disabled={app.duration <= 15}
				aria-label="15 minutes shorter"
			>
				<Minus class="size-3.5" />
			</button>
			<output class="w-16 text-center text-[13px] font-semibold tabular" aria-live="polite">
				{formatDuration(app.duration)}
			</output>
			<button
				class="flex h-full w-8 items-center justify-center rounded-r-lg text-fg-2 hover:bg-subtle hover:text-fg disabled:opacity-40"
				onclick={() => app.setDuration(app.duration + 15)}
				disabled={app.duration >= 480}
				aria-label="15 minutes longer"
			>
				<Plus class="size-3.5" />
			</button>
		</div>
	</div>
	<div class="grid grid-cols-6 gap-1" role="group" aria-label="Common meeting lengths">
		{#each PRESETS as minutes (minutes)}
			<button
				class="h-7 rounded-md text-xs font-medium tabular transition-colors {app.duration ===
				minutes
					? 'bg-accent text-on-accent'
					: 'bg-subtle text-fg-2 hover:text-fg'}"
				aria-pressed={app.duration === minutes}
				onclick={() => app.setDuration(minutes)}
			>
				{formatDuration(minutes)}
			</button>
		{/each}
	</div>
</div>
