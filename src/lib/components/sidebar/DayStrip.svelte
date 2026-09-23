<script lang="ts">
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatTimeRange } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { heatColor } from '$lib/ui/heat';

	/** A one-line view of the block's day, standing in for the heatmap on small screens. */
	let { block }: { block: TimeBlock } = $props();

	const event = $derived(app.event!);
	const grid = $derived(app.grid!);
	const day = $derived(grid.days[block.day]);

	/** The day's slots, split wherever time jumps (a lunch gap, or a timezone shift past midnight). */
	const segments = $derived.by(() => {
		const slots = [...day.slotByMinute.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
		const out: number[][] = [];
		slots.forEach((slot, i) => {
			const prev = slots[i - 1];
			if (i === 0 || event.slots[slot].time - event.slots[prev].time > event.slotSeconds) {
				out.push([]);
			}
			out[out.length - 1].push(slot);
		});
		return out;
	});

	const range = (segment: number[]) =>
		formatTimeRange(
			event.slots[segment[0]].time,
			event.slots[segment[segment.length - 1]].time + event.slotSeconds,
			grid.zone
		);
</script>

<!-- Dark like the heatmap it stands in for. -->
<div class="rounded-lg bg-canvas p-2.5 scheme-dark">
	<p class="mb-1.5 text-[11px] text-fg-3">
		{day.weekday}{day.date ? `, ${day.date}` : ''} at a glance
	</p>
	<div class="flex gap-1.5">
		{#each segments as segment (segment[0])}
			<div class="min-w-0" style:flex-grow={segment.length} style:flex-basis="0">
				<div
					class="flex h-3 gap-px"
					role="img"
					aria-label="Availability {range(segment)}, with this time highlighted"
				>
					{#each segment as slot (slot)}
						<span
							class="h-full min-w-0 flex-1 first:rounded-l-sm last:rounded-r-sm {slot >=
								block.startSlot && slot <= block.endSlot
								? ''
								: 'opacity-35'}"
							style:background={heatColor(app.attendance!.counts[slot], app.attendance!.total)}
						></span>
					{/each}
				</div>
				<p class="mt-1 truncate text-[11px] text-fg-3 tabular">{range(segment)}</p>
			</div>
		{/each}
	</div>
</div>
