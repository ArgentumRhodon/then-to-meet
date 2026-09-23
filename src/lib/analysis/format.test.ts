import { describe, expect, it } from 'vitest';
import { formatTimeRange } from './format';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('formatTimeRange', () => {
	it('shows only times for a block that ends at midnight', () => {
		const text = formatTimeRange(at('2026-09-28T22:00:00Z'), at('2026-09-29T00:00:00Z'), 'UTC');
		expect(text).not.toMatch(/2026|\//);
		expect(text).toMatch(/10:00.*12:00/);
	});

	it('shows only times within a day', () => {
		const text = formatTimeRange(at('2026-09-29T14:00:00Z'), at('2026-09-29T15:30:00Z'), 'UTC');
		expect(text).not.toMatch(/2026|\//);
		expect(text).toMatch(/2:00.*3:30/);
	});
});
