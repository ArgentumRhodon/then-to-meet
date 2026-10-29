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

	it('saves the top of the ramp for everyone free, even in a big group', () => {
		expect(heatColor(28, 29)).not.toContain('var(--heat-high) 100%');
		expect(strength(heatColor(100, 100)) - strength(heatColor(99, 100))).toBeGreaterThan(10);
	});

	it('stays on the low-to-mid half until nearly everyone is free', () => {
		expect(heatColor(4, 5)).toContain('var(--heat-low)');
		expect(heatColor(9, 10)).toContain('var(--heat-high)');
	});
});
