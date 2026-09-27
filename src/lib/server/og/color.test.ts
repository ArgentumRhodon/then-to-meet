import { describe, expect, it } from 'vitest';
import { HEAT_EMPTY, heatHex } from './color';

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('heatHex', () => {
	it('matches what Chrome draws for the heatmap’s color-mix() colors', () => {
		// Chrome's rendering of heatColor(n, 7) with the standard palette, n = 0 to 7.
		const chrome = [
			'#3a434f',
			'#8d514c',
			'#a05949',
			'#b46841',
			'#c58237',
			'#cea83a',
			'#b3b900',
			'#4ccb15'
		];
		chrome.forEach((expected, n) => {
			const actual = channels(heatHex(n, 7));
			channels(expected).forEach((c, i) => expect(Math.abs(actual[i] - c)).toBeLessThanOrEqual(2));
		});
	});

	it('leaves empty slots in the empty color', () => {
		expect(heatHex(0, 5)).toBe(HEAT_EMPTY);
		expect(heatHex(2, 0)).toBe(HEAT_EMPTY);
	});
});
