import { describe, expect, it } from 'vitest';
import { heatColor } from './heat';

const strength = (css: string) => Number(css.match(/(\d+)%, var\(--heat-fade\)/)![1]);

describe('heatColor', () => {
	it('leaves empty slots in the empty color', () => {
		expect(heatColor(0, 5)).toBe('var(--heat-0)');
		expect(heatColor(3, 0)).toBe('var(--heat-0)');
	});

	it('ends on the full "everyone" color', () => {
		expect(heatColor(5, 5)).toContain('var(--heat-high) 100%');
		expect(strength(heatColor(5, 5))).toBe(100);
	});

	it('gets steadily bolder as more people are free', () => {
		const levels = [1, 2, 3, 4, 5].map((n) => strength(heatColor(n, 5)));
		expect(levels).toEqual([...levels].sort((a, b) => a - b));
		expect(new Set(levels).size).toBe(levels.length);
	});

	it('stays on the low-to-mid half until most people are free', () => {
		expect(heatColor(2, 5)).toContain('var(--heat-low)');
		expect(heatColor(4, 5)).toContain('var(--heat-high)');
	});
});
