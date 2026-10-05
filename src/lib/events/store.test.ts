import { describe, expect, it } from 'vitest';
import { isNativeEventId } from './id';
import { importedEventId } from './store';

describe('importedEventId', () => {
	it('is the same for the same user and poll, so importing twice finds the first copy', async () => {
		expect(await importedEventId('uid-1', '123-abc')).toBe(
			await importedEventId('uid-1', '123-abc')
		);
	});

	it('differs by user and by poll', async () => {
		const id = await importedEventId('uid-1', '123-abc');
		expect(await importedEventId('uid-2', '123-abc')).not.toBe(id);
		expect(await importedEventId('uid-1', '124-abc')).not.toBe(id);
	});

	it('looks like any other ThenToMeet event ID', async () => {
		expect(isNativeEventId(await importedEventId('uid-1', '123-abc'))).toBe(true);
	});
});
