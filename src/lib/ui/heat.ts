/** The accent mixed into the empty-cell color at `pct` percent (used for a single person). */
export const heatMix = (pct: number): string =>
	`color-mix(in oklab, var(--accent) ${pct}%, var(--heat-0))`;

/**
 * How far up the ramp a slot can climb while anyone is missing. The rest is held back for
 * everyone being free, so a perfect slot is a clear step up from one person short, even in a big
 * group where 28 and 29 of 29 would otherwise look the same.
 */
export const SHORT_OF_EVERYONE = 0.8;

/**
 * Color for a slot where `count` of `total` people are free: a ramp from `--heat-low` through
 * `--heat-mid` to `--heat-high`, run in OKLCH so the middle doesn't go muddy. Fewer people also
 * fade toward the empty color, so "more available" reads as bolder, not just a shift in hue, which
 * keeps the scale legible for every kind of color vision. Only everyone free reaches the top.
 */
export const heatColor = (count: number, total: number): string => {
	if (!total || !count) return 'var(--heat-0)';
	const f = count >= total ? 1 : (count / total) * SHORT_OF_EVERYONE;
	// Eased so the low stop covers "few people", the mid "most", and the top is saved for the end.
	const t = f ** 2;
	const hue =
		t <= 0.5
			? `color-mix(in oklch, var(--heat-mid) ${Math.round(t * 200)}%, var(--heat-low))`
			: `color-mix(in oklch, var(--heat-high) ${Math.round((t - 0.5) * 200)}%, var(--heat-mid))`;
	// Fade toward a hueless gray in OKLCH so the hue holds; OKLab would drift toward brown.
	return `color-mix(in oklch, ${hue} ${Math.round(35 + 65 * f)}%, var(--heat-fade))`;
};
