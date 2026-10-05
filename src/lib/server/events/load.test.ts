import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { W2MEvent } from '$lib/types';

const mocks = vi.hoisted(() => ({ loadNativeEvent: vi.fn() }));

vi.mock('$lib/events/store', () => ({ loadNativeEvent: mocks.loadNativeEvent }));
vi.mock('$lib/firebase/config', () => ({ accountsEnabled: () => true }));
vi.mock('$lib/firebase/client', () => ({ getClientDb: () => ({}) }));
vi.mock('../w2m', () => ({
	EventLoadError: class extends Error {
		constructor(
			public status: number,
			message: string
		) {
			super(message);
		}
	},
	getEvent: vi.fn()
}));

import { NativeEventNotFound } from '$lib/events/model';
import { CACHE_MS, clearEventCache, loadEvent } from './load';

const ID = 'aB3dE5gH7jK9mN1pQ3sT';
const event = { id: ID, title: 'Lunch' } as W2MEvent;

beforeEach(() => {
	vi.useFakeTimers();
	clearEventCache();
	mocks.loadNativeEvent.mockReset();
	mocks.loadNativeEvent.mockResolvedValue(event);
});
afterEach(() => vi.useRealTimers());

describe('loading a ThenToMeet event on the server', () => {
	it('shares one read between requests that come close together', async () => {
		const [a, b] = await Promise.all([loadEvent(ID), loadEvent(ID)]);
		await loadEvent(ID);
		expect(a).toBe(event);
		expect(b).toBe(event);
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(1);
	});

	it('reads again once the copy is old, or when a fresh one is asked for', async () => {
		await loadEvent(ID);
		await loadEvent(ID, fetch, { fresh: true });
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(CACHE_MS + 1);
		await loadEvent(ID);
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(3);
	});

	it('lets a page read the event itself, and shares that with the preview image after it', async () => {
		await loadEvent(ID);
		await loadEvent(ID, fetch, { reread: true });
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(2);
		await loadEvent(ID);
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(2);
	});

	it('keeps events apart', async () => {
		await loadEvent(ID);
		await loadEvent('zZ9yY8xX7wW6vV5uU4tT');
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(2);
	});

	it('does not keep a failure, so the next request tries again', async () => {
		mocks.loadNativeEvent.mockRejectedValueOnce(new Error('offline'));
		await expect(loadEvent(ID)).rejects.toMatchObject({ status: 502 });
		await loadEvent(ID);
		expect(mocks.loadNativeEvent).toHaveBeenCalledTimes(2);
	});

	it('does not keep a missing event either, so a new one shows up at once', async () => {
		mocks.loadNativeEvent.mockRejectedValueOnce(new NativeEventNotFound());
		await expect(loadEvent(ID)).rejects.toMatchObject({ status: 404 });
		expect(await loadEvent(ID)).toBe(event);
	});
});
