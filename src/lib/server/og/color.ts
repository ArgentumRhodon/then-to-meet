/**
 * The heatmap's colors as plain hex, for rendering it outside the browser. The app builds them
 * with CSS color-mix() in OKLCH (see `heatColor` in $lib/ui/heat.ts); this does the same math,
 * since the image renderer doesn't understand color-mix().
 */

interface Oklch {
	l: number;
	c: number;
	/** Degrees, or null for a hueless gray ("none" in CSS). */
	h: number | null;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const fromHex = (hex: string): Oklch => {
	const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
};

const toHex = ({ l: L, c, h }: Oklch): string => {
	const rad = ((h ?? 0) * Math.PI) / 180;
	const [A, B] = [c * Math.cos(rad), c * Math.sin(rad)];
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	const rgb = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	return (
		'#' +
		rgb
			.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255))
			.map((v) => v.toString(16).padStart(2, '0'))
			.join('')
	);
};

/**
 * color-mix(in oklch, a <weight>, b): hues take the shorter way around, and a missing hue takes
 * the other color's. `weight` is a's share, from 0 to 1.
 */
const mix = (a: Oklch, b: Oklch, weight: number): Oklch => {
	let [ha, hb] = [a.h ?? b.h, b.h ?? a.h];
	if (ha !== null && hb !== null) {
		if (hb - ha > 180) ha += 360;
		else if (ha - hb > 180) hb += 360;
	}
	return {
		l: a.l * weight + b.l * (1 - weight),
		c: a.c * weight + b.c * (1 - weight),
		h: ha === null || hb === null ? null : (ha * weight + hb * (1 - weight)) % 360
	};
};

/** The standard palette's dark values, from app.css. */
export const HEAT_EMPTY = '#3a434f';
const LOW = fromHex('#ec5757');
const MID = fromHex('#f4c12a');
const HIGH = fromHex('#9be86a');
const FADE: Oklch = { l: 0.38, c: 0, h: null };

/** `heatColor` from $lib/ui/heat.ts, as hex: the color for `count` of `total` people free. */
export const heatHex = (count: number, total: number): string => {
	if (!total || !count) return HEAT_EMPTY;
	const f = count / total;
	const t = f ** 2;
	const hue =
		t <= 0.5
			? mix(MID, LOW, Math.round(t * 200) / 100)
			: mix(HIGH, MID, Math.round((t - 0.5) * 200) / 100);
	return toHex(mix(hue, FADE, Math.round(35 + 65 * f) / 100));
};
