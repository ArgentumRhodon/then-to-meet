<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Globe from '@lucide/svelte/icons/globe';
	import { formatOffset } from '$lib/analysis/format';
	import { app, localZone } from '$lib/state/app.svelte';
	import { dismissable } from '$lib/ui/dismissable';
	import { keepInView } from '$lib/ui/keepInView';

	let open = $state(false);
	let query = $state('');

	const weekly = $derived(app.event?.weekly ?? false);
	const local = localZone();

	const zones = (() => {
		try {
			const all = Intl.supportedValuesOf('timeZone');
			return all.includes('UTC') ? all : ['UTC', ...all];
		} catch {
			return ['UTC', local];
		}
	})();

	const place = (zone: string) => zone.split('/').pop()!.replaceAll('_', ' ');
	const region = (zone: string) => zone.split('/').slice(0, -1).join(' / ').replaceAll('_', ' ');

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase().replaceAll(' ', '_');
		const list = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
		// Keep the viewer's own zone on top when it matches.
		return list.includes(local) ? [local, ...list.filter((z) => z !== local)] : list;
	});

	const choose = (zone: string) => {
		app.setZone(zone);
		open = false;
		query = '';
	};

	const focusOnMount = (node: HTMLInputElement) => node.focus();
</script>

<div class="relative" {@attach open ? dismissable(() => (open = false)) : undefined}>
	<button
		class="btn btn-secondary h-8 max-w-56 gap-1.5 px-2.5 text-[13px]"
		onclick={() => (open = !open)}
		disabled={weekly}
		aria-haspopup="listbox"
		aria-expanded={open}
		title={weekly
			? 'Weekly events aren’t tied to a timezone'
			: `Times shown in ${app.zone.replaceAll('_', ' ')}`}
	>
		<Globe class="size-3.5 shrink-0 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
		{#if weekly}
			<span>No timezone</span>
		{:else}
			<span class="truncate">{place(app.zone)}</span>
			<span class="text-fg-3 tabular">{formatOffset(app.zone)}</span>
			<ChevronDown class="size-3.5 shrink-0 text-fg-3 pointer-coarse:size-4" aria-hidden="true" />
		{/if}
	</button>

	{#if open}
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-72 overflow-hidden"
			{@attach keepInView}
		>
			<div class="border-b border-line p-2">
				<input
					class="input h-8 text-[13px] pointer-coarse:text-base"
					type="search"
					placeholder="Search city or region"
					aria-label="Search timezones"
					bind:value={query}
					{@attach focusOnMount}
					onkeydown={(e) => {
						if (e.key === 'Enter' && results[0]) choose(results[0]);
					}}
				/>
			</div>
			<ul class="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Timezones">
				{#each results as zone (zone)}
					<li role="option" aria-selected={zone === app.zone}>
						<button
							class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
							onclick={() => choose(zone)}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[13px] text-fg">
									{place(zone)}
									{#if zone === local}<span class="ml-1 text-[11px] text-accent-fg"
											>Your timezone</span
										>{/if}
								</span>
								{#if region(zone)}<span class="block truncate text-[11px] text-fg-3"
										>{region(zone)}</span
									>{/if}
							</span>
							<span class="text-[11px] text-fg-3 tabular">{formatOffset(zone)}</span>
							<Check
								class="size-3.5 shrink-0 pointer-coarse:size-4.5 {zone === app.zone
									? 'text-accent'
									: 'invisible'}"
								aria-hidden="true"
							/>
						</button>
					</li>
				{:else}
					<li class="px-2.5 py-3 text-[13px] text-fg-3">No timezones match.</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
