import { describe, expect, it } from 'vitest';
import { readShareParams, shareSearch } from './url';

const read = (search: string) => readShareParams(new URL(`https://ttm.example/${search}`));

describe('share URLs', () => {
	it('round-trips roles and duration', () => {
		const search = shareSearch({
			id: '123-abc',
			duration: 90,
			roles: { 1: 'optional', 2: 'skip', 3: 'optional' }
		});
		expect(search).toBe('?e=123-abc&d=90&opt=1,3&skip=2');
		expect(read(search)).toEqual({
			id: '123-abc',
			duration: 90,
			roles: { 1: 'optional', 3: 'optional', 2: 'skip' }
		});
	});

	it('treats a full link with no roles as everyone required', () => {
		expect(read(shareSearch({ id: '123-abc', duration: 60, roles: {} }))).toEqual({
			id: '123-abc',
			duration: 60,
			roles: {}
		});
	});

	it('leaves roles unset for a bare event link so saved prefs apply', () => {
		expect(read('?e=123-abc')).toEqual({ id: '123-abc' });
	});

	it('still opens v1 links', () => {
		expect(read('?12345678-AbCdE')).toEqual({ id: '12345678-AbCdE' });
	});

	it('round-trips the group name, a picked time, and the timezone', () => {
		const search = shareSearch({
			id: '123-abc',
			duration: 60,
			roles: { 2: 'skip' },
			group: 'Design team',
			picks: [{ start: 1_800_000_000, end: 1_800_005_400 }],
			zone: 'America/New_York'
		});
		expect(search).toBe(
			'?e=123-abc&d=60&skip=2&g=Design+team&at=1800000000&len=90&tz=America/New_York'
		);
		expect(read(search)).toEqual({
			id: '123-abc',
			duration: 60,
			roles: { 2: 'skip' },
			group: 'Design team',
			picks: [{ start: 1_800_000_000, end: 1_800_005_400 }],
			zone: 'America/New_York'
		});
	});

	it('gives a picked time the meeting length unless it says otherwise', () => {
		const search = shareSearch({
			id: '123-abc',
			duration: 45,
			roles: {},
			picks: [{ start: 1_800_000_000, end: 1_800_002_700 }]
		});
		expect(search).toBe('?e=123-abc&d=45&at=1800000000');
		expect(read(search).picks).toEqual([{ start: 1_800_000_000, end: 1_800_002_700 }]);
		expect(read('?e=123-abc&at=1800000000').picks).toEqual([
			{ start: 1_800_000_000, end: 1_800_003_600 }
		]);
	});

	it('round-trips several picked times, with lengths only when one differs', () => {
		const same = [
			{ start: 1_800_000_000, end: 1_800_003_600 },
			{ start: 1_800_172_800, end: 1_800_176_400 }
		];
		const search = shareSearch({ id: '123-abc', duration: 60, roles: {}, picks: same });
		expect(search).toBe('?e=123-abc&d=60&at=1800000000,1800172800');
		expect(read(search).picks).toEqual(same);

		const mixed = [same[0], { start: 1_800_172_800, end: 1_800_178_200 }];
		const withLengths = shareSearch({ id: '123-abc', duration: 60, roles: {}, picks: mixed });
		expect(withLengths).toBe('?e=123-abc&d=60&at=1800000000,1800172800&len=60,90');
		expect(read(withLengths).picks).toEqual(mixed);

		const many = Array.from({ length: 15 }, (_, i) => 1_800_000_000 + i * 3600).join(',');
		expect(read(`?e=123-abc&at=${many}`).picks).toHaveLength(10);
	});

	it('carries how many times a week to meet, only when more than once', () => {
		expect(shareSearch({ id: '123-abc', duration: 60, roles: {}, perWeek: 1 })).toBe(
			'?e=123-abc&d=60'
		);
		const search = shareSearch({ id: '123-abc', duration: 60, roles: {}, perWeek: 3 });
		expect(search).toBe('?e=123-abc&d=60&n=3');
		expect(read(search).perWeek).toBe(3);
		expect(read('?e=123-abc&n=4').perWeek).toBeUndefined();
		expect(read('?e=123-abc&n=1').perWeek).toBeUndefined();
	});

	it('clamps meeting lengths to what the app supports', () => {
		expect(read('?e=123-abc&d=7').duration).toBe(15);
		expect(read('?e=123-abc&d=50').duration).toBe(45);
		expect(read('?e=123-abc&d=600').duration).toBe(480);
		expect(read('?e=123-abc&d=abc').duration).toBeUndefined();
		expect(read('?e=123-abc&d=-30').duration).toBeUndefined();
	});

	it('rejects junk', () => {
		expect(read('?e=<script>')).toEqual({ id: null });
		expect(read('?e=123-abc&opt=a,-1,4').roles).toEqual({ 4: 'optional' });
		expect(read('?e=123-abc&tz=Not/AZone').zone).toBeUndefined();
		expect(read('?e=123-abc&at=soon').picks).toBeUndefined();
		expect(read('?e=123-abc&g=%20%20').group).toBeUndefined();
		expect(read(`?e=123-abc&g=${'x'.repeat(100)}`).group).toHaveLength(60);
	});
});
