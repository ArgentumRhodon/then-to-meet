import { describe, expect, it } from 'vitest';
import { extractEventId } from '$lib/w2m/id';
import { extractAnyEventId, isAnyEventId, isImportableId, isNativeEventId } from './id';

const NATIVE = 'aB3dE5gH7jK9mN1pQ3sT';

describe('event IDs', () => {
	it('tells ThenToMeet IDs from When2Meet’s', () => {
		expect(isNativeEventId(NATIVE)).toBe(true);
		expect(isNativeEventId('12345678-AbCdE')).toBe(false);
		expect(isNativeEventId('demo')).toBe(false);
		expect(isNativeEventId(NATIVE + 'x')).toBe(false);
	});

	it('still accepts every ID When2Meet and the demo used', () => {
		for (const id of ['12345678-AbCdE', '9-x1', 'demo', NATIVE])
			expect(isAnyEventId(id)).toBe(true);
		expect(isAnyEventId('not an id')).toBe(false);
		expect(isAnyEventId('')).toBe(false);
	});

	it('imports only real When2Meet polls', () => {
		expect(isImportableId('12345678-AbCdE')).toBe(true);
		expect(isImportableId('demo')).toBe(false);
		expect(isImportableId(NATIVE)).toBe(false);
	});
});

describe('extractAnyEventId', () => {
	it('reads everything extractEventId does, unchanged', () => {
		for (const input of [
			'https://www.when2meet.com/?12345678-AbCdE',
			'  when2meet.com/?9-x1 ',
			'12345678-AbCdE',
			'Demo',
			'https://example.com',
			''
		]) {
			expect(extractAnyEventId(input)).toBe(extractEventId(input));
		}
	});

	it('reads a ThenToMeet link', () => {
		expect(extractAnyEventId(`https://then-to-meet.app/?e=${NATIVE}&d=60`)).toBe(NATIVE);
		expect(extractAnyEventId(`?d=60&e=${NATIVE}`)).toBe(NATIVE);
	});

	it('ignores IDs that are too long or merely look similar', () => {
		expect(extractAnyEventId(`?e=${NATIVE}extra`)).toBeNull();
		expect(extractAnyEventId(NATIVE)).toBeNull();
	});
});
