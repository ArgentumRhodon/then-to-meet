<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Globe from '@lucide/svelte/icons/globe';
	import LogIn from '@lucide/svelte/icons/log-in';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Settings from '@lucide/svelte/icons/settings';
	import Sun from '@lucide/svelte/icons/sun';
	import { formatOffset } from '$lib/analysis/format';
	import { accounts } from '$lib/state/accounts.svelte';
	import { app } from '$lib/state/app.svelte';
	import { theme, type ThemePref } from '$lib/state/theme.svelte';
	import { dismissable } from './dismissable';
	import HeatPaletteOptions from './HeatPaletteOptions.svelte';
	import { keepInView } from './keepInView';
	import TimezoneList from './TimezoneList.svelte';

	const OPTIONS = [
		{ value: 'dark', label: 'Dark', icon: Moon },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'system', label: 'System', hint: 'Match your device', icon: Monitor }
	] as const;

	let open = $state(false);
	let view = $state<'main' | 'timezone'>('main');

	// Only an open event has times to show in a zone; the start page has none.
	const hasEvent = $derived(app.event !== null);
	const weekly = $derived(app.event?.weekly ?? false);

	const close = () => {
		open = false;
		view = 'main';
	};

	const toggle = () => {
		if (open) close();
		else open = true;
	};

	const signIn = async () => {
		if (await accounts.signIn()) close();
	};

	const signOut = async () => {
		close();
		await accounts.signOut();
	};

	const choose = (value: ThemePref) => {
		theme.set(value);
		close();
	};
</script>

<div class="relative" {@attach open ? dismissable(close) : undefined}>
	<button
		class="btn btn-secondary h-8 gap-1.5 px-2.5 text-[13px]"
		onclick={toggle}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Account, theme, heatmap colors, and timezone"
	>
		<Settings class="size-3.5 text-fg-2 pointer-coarse:size-4.5" aria-hidden="true" />
		Settings
	</button>
	{#if open}
		<div
			class="popover absolute top-full right-0 z-30 mt-1.5 w-72 overflow-hidden"
			role={view === 'main' ? 'menu' : undefined}
			aria-label="Settings"
			{@attach keepInView}
		>
			{#if view === 'timezone'}
				<div class="flex items-center gap-1 border-b border-line p-1">
					<button
						class="btn btn-ghost btn-icon size-7 shrink-0"
						onclick={() => (view = 'main')}
						aria-label="Back to settings"
					>
						<ArrowLeft class="size-4 pointer-coarse:size-5" aria-hidden="true" />
					</button>
					<p class="eyebrow">Timezone</p>
				</div>
				<TimezoneList onchoose={close} />
			{:else}
				<div class="p-1">
					{#if accounts.enabled}
						<p class="eyebrow px-2.5 pt-1.5 pb-1">Account</p>
						{#if accounts.user}
							<div class="px-2.5 py-1.5">
								<span class="block truncate text-[13px]">
									{accounts.user.name ?? accounts.user.email}
								</span>
								{#if accounts.user.name && accounts.user.email}
									<span class="block truncate text-[11px] text-fg-3">{accounts.user.email}</span>
								{/if}
							</div>
							<button
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle disabled:opacity-60 pointer-coarse:py-2.5"
								role="menuitem"
								disabled={accounts.busy}
								onclick={signOut}
							>
								<LogOut
									class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5"
									aria-hidden="true"
								/>
								<span class="text-[13px]">Sign out</span>
							</button>
						{:else}
							<button
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle disabled:opacity-60 pointer-coarse:py-2.5"
								role="menuitem"
								disabled={accounts.busy}
								onclick={signIn}
							>
								<LogIn class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
								<span class="flex-1">
									<span class="block text-[13px]">Sign in with Google</span>
									<span class="block text-[11px] text-fg-3">Keep and import your events</span>
								</span>
							</button>
						{/if}
						<div class="my-1 border-t border-line"></div>
					{/if}
					<p class="eyebrow px-2.5 pt-1.5 pb-1">Theme</p>
					{#each OPTIONS as option (option.value)}
						<button
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle pointer-coarse:py-2.5"
							role="menuitemradio"
							aria-checked={theme.pref === option.value}
							onclick={() => choose(option.value)}
						>
							<option.icon
								class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5"
								aria-hidden="true"
							/>
							<span class="flex-1">
								<span class="block text-[13px]">{option.label}</span>
								{#if 'hint' in option}<span class="block text-[11px] text-fg-3">{option.hint}</span
									>{/if}
							</span>
							<Check
								class="size-3.5 shrink-0 pointer-coarse:size-4.5 {theme.pref === option.value
									? 'text-accent'
									: 'invisible'}"
								aria-hidden="true"
							/>
						</button>
					{/each}
					<div class="my-1 border-t border-line"></div>
					<p class="eyebrow px-2.5 pt-1.5 pb-1">Heatmap colors</p>
					<HeatPaletteOptions onchoose={close} />
					{#if hasEvent}
						<div class="my-1 border-t border-line"></div>
						<p class="eyebrow px-2.5 pt-1.5 pb-1">Timezone</p>
						<button
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-subtle disabled:opacity-60 disabled:hover:bg-transparent pointer-coarse:py-2.5"
							role="menuitem"
							disabled={weekly}
							onclick={() => (view = 'timezone')}
						>
							<Globe class="size-4 shrink-0 text-fg-2 pointer-coarse:size-5" aria-hidden="true" />
							<span class="min-w-0 flex-1">
								{#if weekly}
									<span class="block text-[13px]">No timezone</span>
									<span class="block text-[11px] text-fg-3">Weekly events aren’t tied to one</span>
								{:else}
									<span class="block truncate text-[13px]"
										>{app.zone.split('/').pop()!.replaceAll('_', ' ')}</span
									>
									<span class="block text-[11px] text-fg-3 tabular">{formatOffset(app.zone)}</span>
								{/if}
							</span>
							{#if !weekly}
								<ChevronRight
									class="size-3.5 shrink-0 text-fg-3 pointer-coarse:size-4.5"
									aria-hidden="true"
								/>
							{/if}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
