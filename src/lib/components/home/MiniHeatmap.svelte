<script lang="ts">
	import { DateTime } from 'luxon';
	import type { OverviewDay } from '$lib/analysis/overview';
	import { heatColor } from '$lib/ui/heat';

	/** An event's heatmap at a glance: a column per day, a cell per hour. */
	let { heat, label }: { heat: OverviewDay[]; label: string } = $props();

	const rows = $derived(heat[0]?.hours.length ?? 0);
	/** Weekday names under the columns, while there's room for them. */
	const days = $derived(
		heat.length <= 14
			? heat.map((column) =>
					DateTime.fromISO(column.day, { zone: 'UTC' }).toLocaleString({
						weekday: heat.length <= 7 ? 'short' : 'narrow'
					})
				)
			: []
	);
	const columns = $derived(`repeat(${heat.length}, minmax(0, 1fr))`);
</script>

{#if heat.length && rows}
	<!-- Dark like the heatmap it stands for. -->
	<div class="rounded-lg bg-canvas p-2 scheme-dark" role="img" aria-label={label}>
		<div
			class="grid h-14"
			style:grid-template-columns={columns}
			style:grid-template-rows="repeat({rows}, minmax(0, 1fr))"
			style:grid-auto-flow="column"
			style:column-gap="{heat.length > 14 ? 1 : 2}px"
			style:row-gap="{rows > 14 ? 0 : 1}px"
		>
			{#each heat as column (column.day)}
				{#each [...column.hours] as level, hour (hour)}
					<span
						class="min-h-0 rounded-[1px]"
						style:background={level === '.' ? 'transparent' : heatColor(Number(level), 9)}
					></span>
				{/each}
			{/each}
		</div>
		{#if days.length}
			<div
				class="mt-1 grid text-center text-[0.625rem] leading-none text-fg-3"
				style:grid-template-columns={columns}
				aria-hidden="true"
			>
				{#each days as day, i (i)}
					<span class="truncate">{day}</span>
				{/each}
			</div>
		{/if}
	</div>
{/if}
