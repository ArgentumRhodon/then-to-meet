import { describe, expect, it } from 'vitest';
import { sweep } from './sweep';

const points = (x0: number, y0: number, x1: number, y1: number, spacing?: number) => {
	const seen: [number, number][] = [];
	sweep(x0, y0, x1, y1, (x, y) => seen.push([x, y]), spacing);
	return seen;
};

describe('sweep', () => {
	it('visits points along the line, ending exactly on the last one', () => {
		const seen = points(0, 0, 30, 0, 10);
		expect(seen).toEqual([
			[10, 0],
			[20, 0],
			[30, 0]
		]);
	});

	it('follows diagonals', () => {
		const seen = points(0, 0, 30, 40, 10);
		expect(seen).toHaveLength(5);
		expect(seen[4]).toEqual([30, 40]);
	});

	it('still visits the end when the pointer barely moved', () => {
		expect(points(5, 5, 6, 5)).toEqual([[6, 5]]);
		expect(points(5, 5, 5, 5)).toEqual([[5, 5]]);
	});

	it('leaves no gap wider than the spacing, however fast the pointer jumped', () => {
		const seen = points(0, 0, 500, 0, 6);
		let last = 0;
		for (const [x] of seen) {
			expect(x - last).toBeLessThanOrEqual(6);
			last = x;
		}
	});
});
