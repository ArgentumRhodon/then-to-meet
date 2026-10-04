import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadSettings: vi.fn(),
	saveSettings: vi.fn(),
	loadEventData: vi.fn(),
	saveEventData: vi.fn(),
	toast: vi.fn()
}));

vi.mock('$lib/firebase/client', () => ({ getClientDb: () => 'db' }));
vi.mock('$lib/events/userStore', () => ({
	loadSettings: mocks.loadSettings,
	saveSettings: mocks.saveSettings,
	loadEventData: mocks.loadEventData,
	saveEventData: mocks.saveEventData
}));
vi.mock('$lib/ui/toast.svelte', () => ({ toast: { show: mocks.toast } }));

import { migrateLegacy } from './migrate';

const W2M = '12345678-AbCdE';
const OTHER = '87654321-ZyXwV';

/** A localStorage stand-in that remembers what was removed. */
const makeStorage = (items: Record<string, string>) => {
	const data = new Map(Object.entries(items));
	return {
		data,
		get length() {
			return data.size;
		},
		key: (i: number) => [...data.keys()][i] ?? null,
		getItem: (key: string) => data.get(key) ?? null,
		removeItem: (key: string) => void data.delete(key)
	};
};

const full = () =>
	makeStorage({
		'ttm:theme': 'light',
		'ttm:recent': JSON.stringify([{ id: W2M, title: 'Sync', people: 3, openedAt: 100 }]),
		[`ttm:event:${W2M}`]: JSON.stringify({ duration: 90 }),
		[`ttm:groups:${OTHER}`]: JSON.stringify([{ id: 'g', name: 'G', members: [1] }]),
		unrelated: 'stay'
	});

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.loadSettings.mockResolvedValue(null);
	mocks.loadEventData.mockResolvedValue(null);
	mocks.saveSettings.mockResolvedValue(undefined);
	mocks.saveEventData.mockResolvedValue(undefined);
});

describe('migrateLegacy', () => {
	it('saves settings and each event to the account, then clears only its own keys', async () => {
		const storage = full();
		expect(await migrateLegacy('u1', storage)).toBe(true);

		expect(mocks.saveSettings).toHaveBeenCalledWith('db', 'u1', { theme: 'light' });
		expect(mocks.saveEventData).toHaveBeenCalledWith('db', 'u1', W2M, {
			title: 'Sync',
			people: 3,
			openedAt: 100,
			prefs: { duration: 90 }
		});
		expect(mocks.saveEventData).toHaveBeenCalledWith('db', 'u1', OTHER, {
			groups: [{ id: 'g', name: 'G', members: [1] }]
		});
		expect([...storage.data.keys()]).toEqual(['unrelated']);
		expect(mocks.toast).toHaveBeenCalledTimes(1);
	});

	it('never overwrites what the account already has', async () => {
		mocks.loadSettings.mockResolvedValue({ theme: 'dark' });
		mocks.loadEventData.mockImplementation(async (_db, _uid, id) =>
			id === W2M ? { prefs: { duration: 30 }, title: 'Mine' } : null
		);
		const storage = full();
		await migrateLegacy('u1', storage);

		expect(mocks.saveSettings).not.toHaveBeenCalled();
		// Only the parts the account lacked: the recent-list fields minus the title it has.
		expect(mocks.saveEventData).toHaveBeenCalledWith('db', 'u1', W2M, { people: 3, openedAt: 100 });
		expect([...storage.data.keys()]).toEqual(['unrelated']);
	});

	it('keeps the browser data when a save fails, so the next sign-in tries again', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		mocks.saveEventData.mockRejectedValueOnce(new Error('offline'));
		const storage = full();
		expect(await migrateLegacy('u1', storage)).toBe(false);

		expect(storage.data.has(`ttm:event:${W2M}`)).toBe(true);
		expect(storage.data.has('ttm:theme')).toBe(true);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	it('does nothing, and touches no network, when there is nothing to move', async () => {
		const storage = makeStorage({ unrelated: 'stay' });
		expect(await migrateLegacy('u1', storage)).toBe(false);
		expect(mocks.loadSettings).not.toHaveBeenCalled();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('clears keys quietly when the account already had everything', async () => {
		mocks.loadSettings.mockResolvedValue({ theme: 'dark' });
		mocks.loadEventData.mockResolvedValue({
			title: 'x',
			people: 1,
			openedAt: 1,
			prefs: {},
			groups: []
		});
		const storage = full();
		expect(await migrateLegacy('u1', storage)).toBe(false);
		expect([...storage.data.keys()]).toEqual(['unrelated']);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	it('runs once even if asked twice at the same time', async () => {
		const storage = full();
		const [a, b] = await Promise.all([migrateLegacy('u1', storage), migrateLegacy('u1', storage)]);
		expect(a).toBe(b);
		expect(mocks.saveSettings).toHaveBeenCalledTimes(1);
	});

	it('does nothing without browser storage', async () => {
		expect(await migrateLegacy('u1', null)).toBe(false);
	});
});
