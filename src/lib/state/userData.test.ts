import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	accounts: { ready: Promise.resolve(), user: { uid: 'u1' } as { uid: string } | null },
	saveEventData: vi.fn(),
	loadEventData: vi.fn(),
	toast: vi.fn(),
	migrateLegacy: vi.fn()
}));

vi.mock('./accounts.svelte', () => ({ accounts: mocks.accounts }));
vi.mock('./migrate', () => ({ migrateLegacy: mocks.migrateLegacy }));
vi.mock('$lib/ui/toast.svelte', () => ({ toast: { show: mocks.toast, fail: mocks.toast } }));
vi.mock('$lib/firebase/client', () => ({ getClientDb: () => 'db' }));
vi.mock('$lib/events/userStore', () => ({
	saveEventData: mocks.saveEventData,
	loadEventData: mocks.loadEventData,
	loadSettings: vi.fn(),
	saveSettings: vi.fn(),
	loadRecent: vi.fn()
}));

import { userData } from './userData';

const DELAY = 1500;

/** Lets pending promises (the dynamic imports and writes) settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	mocks.accounts.user = { uid: 'u1' };
	mocks.saveEventData.mockReset().mockResolvedValue(undefined);
	mocks.loadEventData.mockReset().mockResolvedValue(null);
	mocks.toast.mockReset();
	mocks.migrateLegacy.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
	await userData.flush();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('queueEvent', () => {
	it('waits, then writes everything queued for an event in one go', async () => {
		userData.queueEvent('e1', { prefs: { duration: 60 } });
		userData.queueEvent('e1', { groups: [] });
		await vi.advanceTimersByTimeAsync(DELAY - 1);
		expect(mocks.saveEventData).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await settle();
		expect(mocks.saveEventData).toHaveBeenCalledTimes(1);
		expect(mocks.saveEventData).toHaveBeenCalledWith('db', 'u1', 'e1', {
			prefs: { duration: 60 },
			groups: []
		});
	});

	it('keeps only the latest value of a field', async () => {
		userData.queueEvent('e2', { prefs: { duration: 30 } });
		userData.queueEvent('e2', { prefs: { duration: 90 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).toHaveBeenCalledWith('db', 'u1', 'e2', {
			prefs: { duration: 90 }
		});
	});

	it('does not send what was just written again', async () => {
		userData.queueEvent('e3', { prefs: { duration: 60 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		mocks.saveEventData.mockClear();

		userData.queueEvent('e3', { prefs: { duration: 60 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('does not send what was loaded from the account', async () => {
		mocks.loadEventData.mockResolvedValue({ prefs: { duration: 45 } });
		await userData.loadEvent('e4');
		userData.queueEvent('e4', { prefs: { duration: 45 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('drops a change that was put back before it was written', async () => {
		mocks.loadEventData.mockResolvedValue({ prefs: { duration: 45 } });
		await userData.loadEvent('e5');
		userData.queueEvent('e5', { prefs: { duration: 90 } });
		userData.queueEvent('e5', { prefs: { duration: 45 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('does nothing when signed out', async () => {
		mocks.accounts.user = null;
		userData.queueEvent('e6', { prefs: { duration: 60 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('never writes one user’s changes under another account', async () => {
		userData.queueEvent('e7', { prefs: { duration: 60 } });
		mocks.accounts.user = { uid: 'u2' };
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).not.toHaveBeenCalled();
	});

	it('writes right away on flush', async () => {
		userData.queueEvent('e8', { groups: [] });
		await userData.flush();
		expect(mocks.saveEventData).toHaveBeenCalledTimes(1);
	});

	it('keeps different events separate', async () => {
		userData.queueEvent('e9', { prefs: { duration: 60 } });
		userData.queueEvent('e10', { prefs: { duration: 60 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).toHaveBeenCalledTimes(2);
	});

	it('says once when saving fails', async () => {
		mocks.saveEventData.mockRejectedValue(new Error('permission-denied'));
		userData.queueEvent('e11', { prefs: { duration: 15 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		userData.queueEvent('e11', { prefs: { duration: 30 } });
		await vi.advanceTimersByTimeAsync(DELAY);
		await settle();
		expect(mocks.saveEventData).toHaveBeenCalledTimes(2);
		expect(mocks.toast).toHaveBeenCalledTimes(1);
	});
});

describe('loadEvent', () => {
	it('is null when signed out, without reading anything', async () => {
		mocks.accounts.user = null;
		expect(await userData.loadEvent('x')).toBeNull();
		expect(mocks.loadEventData).not.toHaveBeenCalled();
	});

	it('is null, not an error, when the read fails', async () => {
		mocks.loadEventData.mockRejectedValue(new Error('offline'));
		expect(await userData.loadEvent('y')).toBeNull();
	});
});

describe('migrating older browser data', () => {
	it('moves it into the account before the first load reads anything', async () => {
		mocks.accounts.user = { uid: 'u-first' };
		const order: string[] = [];
		mocks.migrateLegacy.mockImplementation(async () => {
			order.push('migrate');
			return true;
		});
		mocks.loadEventData.mockImplementation(async () => {
			order.push('load');
			return null;
		});
		await userData.loadEvent('mig1');
		expect(order).toEqual(['migrate', 'load']);
	});

	it('does it once per account, not on every load', async () => {
		mocks.accounts.user = { uid: 'u-once' };
		await userData.loadEvent('a');
		await userData.loadEvent('b');
		expect(mocks.migrateLegacy).toHaveBeenCalledTimes(1);
		expect(mocks.migrateLegacy).toHaveBeenCalledWith('u-once');
	});

	it('is not attempted when signed out', async () => {
		mocks.accounts.user = null;
		await userData.loadEvent('a');
		expect(mocks.migrateLegacy).not.toHaveBeenCalled();
	});
});
