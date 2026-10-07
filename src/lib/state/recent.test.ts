import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventOverview } from '$lib/analysis/overview';
import type { W2MEvent } from '$lib/types';

const mocks = vi.hoisted(() => ({
	accounts: { peekEvents: vi.fn(), user: null as { uid: string } | null },
	userData: { loadRecent: vi.fn(), queueEvent: vi.fn() }
}));

vi.mock('./accounts.svelte', () => ({ accounts: mocks.accounts }));
vi.mock('./userData', () => ({ userData: mocks.userData, RECENT_MAX: 12 }));

import { recent } from './recent.svelte';

/** ThenToMeet event IDs: 20 letters and digits. */
const ALIVE = 'alive000000000000000';
const GONE = 'gone0000000000000000';
const W2M = '12345678-AbCdE';

const entry = (id: string, openedAt: number) => ({ id, title: id, people: 1, openedAt });
const pulse = (id: string, responseCount: number) => ({
	id,
	responseCount,
	role: null,
	title: id,
	updatedAt: 1,
	weekly: false,
	start: 0,
	end: 900
});

const event = (id: string, extra: Partial<W2MEvent> = {}): W2MEvent => ({
	id,
	title: 'Standup',
	weekly: false,
	slotSeconds: 900,
	slots: [{ time: 0, available: [1] }],
	people: [{ id: 1, name: 'Ana', uid: 'u-ana' }],
	noTimes: [{ id: 2, name: 'Ben' }],
	fetchedAt: 0,
	source: 'thentomeet',
	...extra
});

const overview = (responses: number): EventOverview => ({
	weekly: false,
	start: 0,
	end: 900,
	responses,
	zone: 'UTC',
	duration: 60,
	perWeek: 1,
	considered: responses,
	best: null,
	heat: []
});

beforeEach(() => {
	recent.clear();
	mocks.accounts.user = null;
	mocks.accounts.peekEvents.mockReset();
	mocks.accounts.peekEvents.mockResolvedValue({ found: [], missing: [] });
	mocks.userData.loadRecent.mockReset();
	mocks.userData.queueEvent.mockReset();
});

describe('the recent list on sign-in', () => {
	it('drops events their owners have deleted, and tells the account', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry(ALIVE, 2), entry(GONE, 1)]);
		mocks.accounts.peekEvents.mockResolvedValue({ found: [pulse(ALIVE, 3)], missing: [GONE] });
		await recent.load();
		await vi.waitFor(() => expect(recent.items.map((e) => e.id)).toEqual([ALIVE]));
		expect(mocks.accounts.peekEvents).toHaveBeenCalledWith([ALIVE, GONE]);
		expect(mocks.userData.queueEvent).toHaveBeenCalledWith(GONE, { openedAt: 0 });
	});

	it('keeps the latest counts of the ones still there', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry(ALIVE, 2)]);
		mocks.accounts.peekEvents.mockResolvedValue({ found: [pulse(ALIVE, 3)], missing: [] });
		await recent.load();
		await vi.waitFor(() => expect(recent.pulses[ALIVE]).toEqual({ responseCount: 3, role: null }));
	});

	it('keeps everything when the check finds nothing missing', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry(ALIVE, 2), entry(W2M, 1)]);
		await recent.load();
		await Promise.resolve();
		expect(recent.items.map((e) => e.id)).toEqual([ALIVE, W2M]);
		expect(mocks.userData.queueEvent).not.toHaveBeenCalled();
	});

	it('only reads ThenToMeet events, which are the only ones it can', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry(W2M, 1)]);
		await recent.load();
		await Promise.resolve();
		expect(mocks.accounts.peekEvents).not.toHaveBeenCalled();
	});

	it('says when it is loading', async () => {
		let finish!: (items: unknown[]) => void;
		mocks.userData.loadRecent.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		const loading = recent.load();
		expect(recent.loading).toBe(true);
		finish([]);
		await loading;
		expect(recent.loading).toBe(false);
	});
});

describe('checking for news', () => {
	it("doesn't read an event again while its counts are fresh", async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry(ALIVE, 2)]);
		mocks.accounts.peekEvents.mockResolvedValue({ found: [pulse(ALIVE, 3)], missing: [] });
		await recent.load();
		await vi.waitFor(() => expect(recent.pulses[ALIVE]).toBeDefined());
		mocks.accounts.peekEvents.mockClear();
		await recent.check();
		expect(mocks.accounts.peekEvents).not.toHaveBeenCalled();
		await recent.check({ maxAge: 0 });
		expect(mocks.accounts.peekEvents).toHaveBeenCalledWith([ALIVE]);
	});

	it('counts an open event as fresh, so going home reads nothing', async () => {
		mocks.accounts.user = { uid: 'u-ana' };
		recent.remember(event(ALIVE));
		expect(recent.pulses[ALIVE]).toEqual({ responseCount: 2, role: 'member' });
		await recent.check();
		expect(mocks.accounts.peekEvents).not.toHaveBeenCalled();
	});

	it('gives the owner and admins their part', () => {
		mocks.accounts.user = { uid: 'u-boss' };
		recent.remember(event(ALIVE, { ownerId: 'u-boss' }));
		expect(recent.pulses[ALIVE].role).toBe('owner');
		recent.remember(event(ALIVE, { ownerId: 'u-other', adminUids: ['u-boss'] }));
		expect(recent.pulses[ALIVE].role).toBe('admin');
	});
});

describe('overviews', () => {
	it('keeps one for a listed event, and saves it', () => {
		recent.remember(event(ALIVE));
		mocks.userData.queueEvent.mockClear();
		recent.describe(ALIVE, overview(2));
		expect(recent.items[0].overview).toEqual(overview(2));
		expect(mocks.userData.queueEvent).toHaveBeenCalledWith(ALIVE, { overview: overview(2) });
	});

	it('carries it over when the event is opened again', () => {
		recent.remember(event(ALIVE));
		recent.describe(ALIVE, overview(2));
		recent.remember(event(ALIVE, { title: 'Renamed' }));
		expect(recent.items[0]).toMatchObject({ title: 'Renamed', overview: overview(2) });
	});

	it('ignores an event that is not listed, like the demo', () => {
		recent.describe(ALIVE, overview(2));
		expect(recent.items).toEqual([]);
		expect(mocks.userData.queueEvent).not.toHaveBeenCalled();
	});

	it('are forgotten with the rest of the list on sign-out', () => {
		recent.remember(event(ALIVE));
		recent.describe(ALIVE, overview(2));
		recent.clear();
		expect(recent.items).toEqual([]);
		expect(recent.pulses).toEqual({});
	});
});

describe('forgetting an event', () => {
	it('does nothing for one that is not listed, so nothing is saved for it', () => {
		recent.forget('never-opened');
		expect(mocks.userData.queueEvent).not.toHaveBeenCalled();
	});
});
