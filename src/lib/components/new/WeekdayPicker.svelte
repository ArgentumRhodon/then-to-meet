<script lang="ts">
	import { sweep } from '$lib/ui/sweep';

	let {
		selected,
		onchange
	}: {
		/** Days of the week as 0 (Sunday) to 6 (Saturday). */
		selected: readonly number[];
		onchange: (next: number[]) => void;
	} = $props();

	const DAYS = [
		{ short: 'Sun', full: 'Sunday' },
		{ short: 'Mon', full: 'Monday' },
		{ short: 'Tue', full: 'Tuesday' },
		{ short: 'Wed', full: 'Wednesday' },
		{ short: 'Thu', full: 'Thursday' },
		{ short: 'Fri', full: 'Friday' },
		{ short: 'Sat', full: 'Saturday' }
	];

	/** What a drag is doing: turning days on or off, decided by the first one it touched. */
	let mode: 'add' | 'remove' | null = null;
	let lastX = 0;
	let lastY = 0;

	const chosen = $derived(new Set(selected));

	const set = (day: number, on: boolean) => {
		if (chosen.has(day) === on) return;
		const next = new Set(chosen);
		if (on) next.add(day);
		else next.delete(day);
		onchange([...next].sort((a, b) => a - b));
	};

	const dayAt = (x: number, y: number): number | null => {
		const day = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')?.dataset.day;
		return day === undefined ? null : Number(day);
	};

	/**
	 * A touch that might be a tap, a swipe along the days, or the start of a scroll. A tap picks its
	 * day when the finger lifts on it; a mostly sideways move turns it into a drag; going up or down
	 * is left to the page, which scrolls (and cancels this).
	 */
	let tap: { id: number; day: number; x: number; y: number } | null = null;
	const TAP_SLOP = 8;

	const begin = (day: number, x: number, y: number, target: HTMLElement, pointerId: number) => {
		mode = chosen.has(day) ? 'remove' : 'add';
		lastX = x;
		lastY = y;
		set(day, mode === 'add');
		target.setPointerCapture(pointerId);
	};

	const onpointerdown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const day = dayAt(e.clientX, e.clientY);
		if (day === null) return;
		if (e.pointerType === 'touch') {
			tap = { id: e.pointerId, day, x: e.clientX, y: e.clientY };
			return;
		}
		begin(day, e.clientX, e.clientY, e.currentTarget as HTMLElement, e.pointerId);
		e.preventDefault();
	};

	const onpointermove = (e: PointerEvent) => {
		if (tap?.id === e.pointerId) {
			const dx = e.clientX - tap.x;
			const dy = e.clientY - tap.y;
			if (Math.hypot(dx, dy) <= TAP_SLOP) return;
			const { day, x, y } = tap;
			tap = null;
			if (Math.abs(dx) <= Math.abs(dy)) return;
			begin(day, x, y, e.currentTarget as HTMLElement, e.pointerId);
		}
		if (!mode) return;
		sweep(lastX, lastY, e.clientX, e.clientY, (x, y) => {
			const day = dayAt(x, y);
			if (day !== null) set(day, mode === 'add');
		});
		lastX = e.clientX;
		lastY = e.clientY;
	};

	const onpointerup = (e: PointerEvent) => {
		if (tap?.id === e.pointerId) {
			const { day } = tap;
			tap = null;
			if (dayAt(e.clientX, e.clientY) === day) set(day, !chosen.has(day));
			return;
		}
		mode = null;
	};

	const end = () => {
		tap = null;
		mode = null;
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="grid max-w-md grid-cols-7 gap-1.5"
	role="group"
	aria-label="Days of the week. Click or drag to choose them."
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={end}
>
	{#each DAYS as day, d (d)}
		<!-- touch-pan-y: a sideways swipe along the days drags, up or down still scrolls the page. -->
		<button
			type="button"
			class="btn touch-pan-y px-0 {chosen.has(d)
				? 'btn-primary light:ring-1 light:ring-accent-strong'
				: 'btn-secondary'}"
			data-day={d}
			aria-pressed={chosen.has(d)}
			aria-label={day.full}
			onclick={(e) => e.detail === 0 && set(d, !chosen.has(d))}
		>
			{day.short}
		</button>
	{/each}
</div>
