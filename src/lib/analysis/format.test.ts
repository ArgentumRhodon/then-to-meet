import { describe, expect, it } from 'vitest';
import { formatOffset, formatTimeRange, formatZone, zonePlace } from './format';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('formatZone', () => {
	it('names a zone by its city, with the offset in effect at a given time', () => {
		expect(formatZone('America/New_York', at('2026-07-01T12:00:00Z'))).toBe(
			'New York time (GMT-4)'
		);
		expect(formatZone('America/New_York', at('2026-12-01T12:00:00Z'))).toBe(
			'New York time (GMT-5)'
		);
		expect(formatZone('Asia/Kolkata', at('2026-07-01T12:00:00Z'))).toBe('Kolkata time (GMT+5:30)');
	});

	it('keeps UTC short', () => {
		expect(formatZone('UTC')).toBe('UTC');
		expect(formatOffset('UTC')).toBe('GMT');
	});

	it('reads underscores as spaces', () => {
		expect(zonePlace('America/Los_Angeles')).toBe('Los Angeles');
	});
});

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
