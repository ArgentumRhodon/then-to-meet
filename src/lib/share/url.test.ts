import { describe, expect, it } from 'vitest';
import { readShareParams, shareSearch } from './url';

const read = (search: string) => readShareParams(new URL(`https://ttm.example/${search}`));

describe('share URLs', () => {
	it('round-trips roles and duration', () => {
		const search = shareSearch('123-abc', 90, { 1: 'optional', 2: 'skip', 3: 'optional' });
		expect(search).toBe('?e=123-abc&d=90&opt=1,3&skip=2');
		expect(read(search)).toEqual({
			id: '123-abc',
			duration: 90,
			roles: { 1: 'optional', 3: 'optional', 2: 'skip' }
		});
	});

	it('treats a full link with no roles as everyone required', () => {
		expect(read(shareSearch('123-abc', 60, {}))).toEqual({
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

	it('rejects junk', () => {
		expect(read('?e=<script>')).toEqual({ id: null });
		expect(read('?e=123-abc&d=7').duration).toBeUndefined();
		expect(read('?e=123-abc&opt=a,-1,4').roles).toEqual({ 4: 'optional' });
	});
});
