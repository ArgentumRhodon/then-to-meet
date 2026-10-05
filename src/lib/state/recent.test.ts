import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	accounts: { missingEvents: vi.fn() },
	userData: { loadRecent: vi.fn(), queueEvent: vi.fn() }
}));

vi.mock('./accounts.svelte', () => ({ accounts: mocks.accounts }));
vi.mock('./userData', () => ({ userData: mocks.userData, RECENT_MAX: 12 }));

import { recent } from './recent.svelte';

const entry = (id: string, openedAt: number) => ({ id, title: id, people: 1, openedAt });

beforeEach(() => {
	recent.clear();
	mocks.accounts.missingEvents.mockReset();
	mocks.userData.loadRecent.mockReset();
	mocks.userData.queueEvent.mockReset();
});

describe('the recent list on sign-in', () => {
	it('drops events their owners have deleted, and tells the account', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry('alive', 2), entry('gone', 1)]);
		mocks.accounts.missingEvents.mockResolvedValue(['gone']);
		await recent.load();
		await vi.waitFor(() => expect(recent.items.map((e) => e.id)).toEqual(['alive']));
		expect(mocks.accounts.missingEvents).toHaveBeenCalledWith(['alive', 'gone']);
		expect(mocks.userData.queueEvent).toHaveBeenCalledWith('gone', { openedAt: 0 });
	});

	it('keeps everything when the check finds nothing missing', async () => {
		mocks.userData.loadRecent.mockResolvedValue([entry('a', 2), entry('b', 1)]);
		mocks.accounts.missingEvents.mockResolvedValue([]);
		await recent.load();
		await Promise.resolve();
		expect(recent.items.map((e) => e.id)).toEqual(['a', 'b']);
		expect(mocks.userData.queueEvent).not.toHaveBeenCalled();
	});
});

describe('forgetting an event', () => {
	it('does nothing for one that is not listed, so nothing is saved for it', () => {
		recent.forget('never-opened');
		expect(mocks.userData.queueEvent).not.toHaveBeenCalled();
	});
});
