import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { W2MEvent } from '$lib/types';

const NATIVE = 'aB3dE5gH7jK9mN1pQ3sT';

const mocks = vi.hoisted(() => ({
	accounts: {
		user: null as { uid: string } | null,
		init: vi.fn(),
		loadEvent: vi.fn(),
		watchEvent: vi.fn(),
		resyncWhen2Meet: vi.fn()
	},
	userData: {
		flush: vi.fn(),
		loadEvent: vi.fn(),
		queueEvent: vi.fn()
	},
	toast: vi.fn()
}));

vi.mock('./accounts.svelte', () => ({ accounts: mocks.accounts }));
vi.mock('./userData', () => ({ userData: mocks.userData, RECENT_MAX: 12 }));
vi.mock('$lib/ui/toast.svelte', () => ({ toast: { show: mocks.toast } }));

import { app } from './app.svelte';
import { recent } from './recent.svelte';

const make = (people: { id: number; name: string }[], free: Record<number, number[]> = {}) =>
	({
		id: NATIVE,
		title: 'Lunch',
		weekly: false,
		slotSeconds: 900,
		slots: [0, 900, 1800].map((time, i) => ({
			time: 1_800_000_000 + time,
			available: people.filter((p) => (free[p.id] ?? []).includes(i)).map((p) => p.id)
		})),
		people,
		noTimes: [],
		fetchedAt: 1,
		source: 'thentomeet'
	}) as W2MEvent;

const ada = { id: 1, name: 'Ada' };
const bo = { id: 2, name: 'Bo' };

/** The callbacks the app handed to watchEvent, and the stop function it got back. */
let watch: {
	onEvent: (e: W2MEvent) => void;
	onError: (e: Error) => void;
	stop: ReturnType<typeof vi.fn>;
};

const open = async () => {
	await app.load(NATIVE);
	// The listener is started in the background after the load finishes.
	await vi.waitFor(() => expect(mocks.accounts.watchEvent).toHaveBeenCalled());
	await Promise.resolve();
};

beforeEach(() => {
	app.reset();
	for (const fn of [
		mocks.accounts.init,
		mocks.accounts.loadEvent,
		mocks.accounts.watchEvent,
		mocks.accounts.resyncWhen2Meet,
		mocks.userData.flush,
		mocks.userData.loadEvent,
		mocks.userData.queueEvent,
		mocks.toast
	]) {
		fn.mockReset();
	}
	mocks.userData.loadEvent.mockResolvedValue(null);
	mocks.accounts.loadEvent.mockResolvedValue(make([ada], { 1: [0] }));
	mocks.accounts.user = null;
	watch = { onEvent: () => {}, onError: () => {}, stop: vi.fn() };
	mocks.accounts.watchEvent.mockImplementation(async (_id, onEvent, onError) => {
		watch.onEvent = onEvent;
		watch.onError = onError;
		return watch.stop;
	});
});

describe('following an event live', () => {
	it('starts when a ThenToMeet event opens, and is not live until something arrives', async () => {
		await open();
		expect(mocks.accounts.watchEvent).toHaveBeenCalledWith(
			NATIVE,
			expect.any(Function),
			expect.any(Function)
		);
		expect(app.live).toBe(false);
		watch.onEvent(make([ada], { 1: [0] }));
		expect(app.live).toBe(true);
	});

	it('does not start for a When2Meet poll', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ ...make([ada]), id: '123-abc', source: undefined }))
			)
		);
		await app.load('123-abc');
		expect(mocks.accounts.watchEvent).not.toHaveBeenCalled();
		expect(app.live).toBe(false);
		vi.unstubAllGlobals();
	});

	it('shows a new response when someone else adds one, and says so', async () => {
		await open();
		watch.onEvent(make([ada, bo], { 1: [0], 2: [1] }));
		expect(app.event!.people).toHaveLength(2);
		expect(app.changes.added).toEqual([2]);
		expect(mocks.toast).toHaveBeenCalledWith('1 new response');
	});

	it('says so when someone changes their times', async () => {
		await open();
		watch.onEvent(make([ada], { 1: [0, 1] }));
		expect(app.changes.updated).toEqual([1]);
		expect(mocks.toast).toHaveBeenCalledWith('1 updated');
	});

	it('does not announce this browser’s own change back to it', async () => {
		await open();
		app.noteOwn(2);
		watch.onEvent(make([ada, bo], { 1: [0], 2: [1] }));
		expect(app.event!.people).toHaveLength(2);
		expect(app.changes.added).toEqual([]);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	it('leaves everything alone for a snapshot that changes nothing', async () => {
		await open();
		const before = app.event;
		watch.onEvent({ ...make([ada], { 1: [0] }), fetchedAt: 999 });
		expect(app.event).toBe(before);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	it('stops following when another event opens, and when the event closes', async () => {
		await open();
		await app.load(NATIVE);
		expect(watch.stop).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(mocks.accounts.watchEvent).toHaveBeenCalledTimes(2));
		app.reset();
		expect(watch.stop).toHaveBeenCalledTimes(2);
		expect(app.live).toBe(false);
	});

	it('ignores a late change for an event that is no longer open', async () => {
		await open();
		const stale = watch.onEvent;
		app.reset();
		stale(make([ada, bo], { 1: [0], 2: [1] }));
		expect(app.event).toBeNull();
	});

	it('falls back to polling quietly if the connection drops', async () => {
		await open();
		watch.onEvent(make([ada], { 1: [0] }));
		expect(app.live).toBe(true);
		watch.onError(new Error('unavailable'));
		expect(app.live).toBe(false);
		expect(app.error).toBeNull();
	});

	it('says so if the event is deleted while it is open', async () => {
		await open();
		const gone = new Error('No ThenToMeet event found at that link.');
		gone.name = 'NativeEventNotFound';
		watch.onError(gone);
		expect(app.live).toBe(false);
		expect(app.error).toBe('This event was deleted.');
		expect(app.event).not.toBeNull();
		// Nothing is left to open, so it leaves the recent list too.
		expect(mocks.userData.queueEvent).toHaveBeenCalledWith(NATIVE, { openedAt: 0 });
	});

	it('takes a deleted event off the recent list when its link is opened', async () => {
		await open();
		expect(recent.items.some((e) => e.id === NATIVE)).toBe(true);
		const gone = new Error('No ThenToMeet event found at that link.');
		gone.name = 'NativeEventNotFound';
		mocks.accounts.loadEvent.mockRejectedValue(gone);
		await app.load(NATIVE);
		expect(app.error).toBe('No ThenToMeet event found at that link.');
		expect(recent.items.some((e) => e.id === NATIVE)).toBe(false);
	});

	it('keeps a recent event when it just could not be loaded', async () => {
		await open();
		mocks.accounts.loadEvent.mockRejectedValue(new Error('Check your connection.'));
		await app.load(NATIVE);
		expect(recent.items.some((e) => e.id === NATIVE)).toBe(true);
	});

	it('keeps working if starting the listener fails', async () => {
		mocks.accounts.watchEvent.mockRejectedValue(new Error('no firebase'));
		await app.load(NATIVE);
		await Promise.resolve();
		expect(app.status).toBe('ready');
		expect(app.live).toBe(false);
	});
});

describe('updating an import from When2Meet', () => {
	const IMPORTED = { ...make([ada], { 1: [0] }), importedFrom: '123-abc' };
	const report = { added: 1, updated: 1, kept: 0, slotsAdded: 0, touched: [1, 2] };

	it('fetches the poll fresh, hands it over, and does not announce its own changes', async () => {
		mocks.accounts.loadEvent.mockResolvedValue(IMPORTED);
		const poll = { ...make([ada, bo]), id: '123-abc', source: undefined };
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(poll)));
		vi.stubGlobal('fetch', fetchMock);
		mocks.accounts.resyncWhen2Meet.mockResolvedValue(report);
		await open();

		await expect(app.resyncImport()).resolves.toEqual(report);
		expect(fetchMock).toHaveBeenCalledWith('/api/event/123-abc?fresh=1');
		expect(mocks.accounts.resyncWhen2Meet).toHaveBeenCalledWith(NATIVE, poll);

		// The live update that follows shows the changes without a toast of its own.
		watch.onEvent(make([ada, bo], { 1: [0], 2: [1] }));
		expect(app.event!.people).toHaveLength(2);
		expect(mocks.toast).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('fails for an event that was not imported', async () => {
		await open();
		await expect(app.resyncImport()).rejects.toThrow(/imported/);
		expect(mocks.accounts.resyncWhen2Meet).not.toHaveBeenCalled();
	});

	it('passes on the poll’s error when it can’t be fetched', async () => {
		mocks.accounts.loadEvent.mockResolvedValue(IMPORTED);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ message: 'No such poll.' }), { status: 404 }))
		);
		await open();
		await expect(app.resyncImport()).rejects.toThrow('No such poll.');
		expect(mocks.accounts.resyncWhen2Meet).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
