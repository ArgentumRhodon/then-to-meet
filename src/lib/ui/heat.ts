/** The accent mixed into the empty-cell color at `pct` percent (used for a single person). */
export const heatMix = (pct: number): string =>
	`color-mix(in oklab, var(--accent) ${pct}%, var(--heat-0))`;

/**
 * Color for a slot where `count` of `total` people are free: v1's red-to-green ramp, run through
 * amber in OKLCH so the middle doesn't go muddy brown. Fewer people also fade toward the empty
 * color, so "more available" reads as brighter and bolder, not just greener, which keeps the scale
 * legible for red-green colorblindness.
 */
export const heatColor = (count: number, total: number): string => {
	if (!total || !count) return 'var(--heat-0)';
	const f = count / total;
	// Eased so red covers "few people", amber "most", and green is saved for (nearly) everyone.
	const t = f ** 2;
	const hue =
		t <= 0.5
			? `color-mix(in oklch, var(--heat-mid) ${Math.round(t * 200)}%, var(--heat-low))`
			: `color-mix(in oklch, var(--heat-high) ${Math.round((t - 0.5) * 200)}%, var(--heat-mid))`;
	// Fade toward a hueless gray in OKLCH so the hue holds; OKLab would drift toward brown.
	return `color-mix(in oklch, ${hue} ${Math.round(35 + 65 * f)}%, var(--heat-fade))`;
};
