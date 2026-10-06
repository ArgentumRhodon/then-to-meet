import { describe, expect, it } from 'vitest';
import { HEAT_EMPTY, heatHex } from './color';

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** OKLab lightness of a hex color, 0 to 1. */
const lightness = (hex: string) => {
	const [r, g, b] = channels(hex).map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
};

describe('heatHex', () => {
	it('matches what Chrome draws for the heatmap’s color-mix() colors', () => {
		// Chrome's rendering of heatColor(n, 7) with the standard palette, n = 0 to 7.
		const chrome = [
			'#3a434f',
			'#8d514c',
			'#a05949',
			'#b46841',
			'#c58237',
			'#cfa83c',
			'#c5c63e',
			'#9be86a'
		];
		chrome.forEach((expected, n) => {
			const actual = channels(heatHex(n, 7));
			channels(expected).forEach((c, i) => expect(Math.abs(actual[i] - c)).toBeLessThanOrEqual(2));
		});
	});

	it('gets lighter with every person free, so "everyone" is the brightest cell', () => {
		for (const total of [4, 7, 12, 20]) {
			const steps = Array.from({ length: total + 1 }, (_, n) => lightness(heatHex(n, total)));
			steps.slice(1).forEach((l, i) => expect(l).toBeGreaterThan(steps[i]));
		}
	});

	it('leaves empty slots in the empty color', () => {
		expect(heatHex(0, 5)).toBe(HEAT_EMPTY);
		expect(heatHex(2, 0)).toBe(HEAT_EMPTY);
	});
});
