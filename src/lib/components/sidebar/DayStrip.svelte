<script lang="ts">
	import type { TimeBlock } from '$lib/analysis/bestTimes';
	import { formatTimeRange } from '$lib/analysis/format';
	import { app } from '$lib/state/app.svelte';
	import { heatColor } from '$lib/ui/heat';

	/**
	 * A one-line view of the block's day, standing in for the heatmap on small screens. Like the
	 * heatmap, it outlines the whole window and lights only the meeting at the chosen start.
	 */
	let { block }: { block: TimeBlock } = $props();

	const event = $derived(app.event!);
	const grid = $derived(app.grid!);
	const day = $derived(grid.days[block.day]);
	const meetingStart = $derived(block.startSlot + app.shiftFor(block));
	const meetingEnd = $derived(meetingStart + app.meetingSlots - 1);

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
			{@const inside = segment.filter((s) => s >= block.startSlot && s <= block.endSlot)}
			<div class="min-w-0" style:flex-grow={segment.length} style:flex-basis="0">
				<div
					class="relative flex h-3 gap-px"
					role="img"
					aria-label="Availability {range(segment)}, with this time highlighted"
				>
					{#each segment as slot (slot)}
						<span
							class="h-full min-w-0 flex-1 first:rounded-l-sm last:rounded-r-sm {slot >=
								meetingStart && slot <= meetingEnd
								? ''
								: 'opacity-35'}"
							style:background={heatColor(app.attendance!.counts[slot], app.attendance!.total)}
						></span>
					{/each}
					{#if inside.length}
						<!-- The whole window, outlined in the accent color like the heatmap's. -->
						<span
							class="pointer-events-none absolute -inset-y-0.5 rounded-[3px] border-2 border-accent"
							style:left="{(segment.indexOf(inside[0]) / segment.length) * 100}%"
							style:width="{(inside.length / segment.length) * 100}%"
						></span>
					{/if}
				</div>
				<p class="mt-1 truncate text-[11px] text-fg-3 tabular">{range(segment)}</p>
			</div>
		{/each}
	</div>
</div>
