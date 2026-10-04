import { describe, expect, it } from 'vitest';
import { MAX_LEGACY_EVENTS, onlyNew, readLegacy, type StorageLike } from './legacy';

const storage = (items: Record<string, string>): StorageLike => {
	const keys = Object.keys(items);
	return {
		get length() {
			return keys.length;
		},
		key: (i) => keys[i] ?? null,
		getItem: (key) => items[key] ?? null
	};
};

const W2M = '12345678-AbCdE';
const OTHER = '87654321-ZyXwV';
const group = { id: 'g1', name: 'Leads', members: [1, 2], roles: { 2: 'optional' } };

describe('readLegacy', () => {
	it('reads settings, the recent list, per-event setup, and groups', () => {
		const legacy = readLegacy(
			storage({
				'ttm:theme': 'light',
				'ttm:heat': 'tritanopia',
				'ttm:recent': JSON.stringify([{ id: W2M, title: 'Sync', people: 5, openedAt: 1000 }]),
				[`ttm:event:${W2M}`]: JSON.stringify({ roles: { 3: 'skip' }, duration: 90 }),
				[`ttm:groups:${W2M}`]: JSON.stringify([group])
			})
		);
		expect(legacy.settings).toEqual({ theme: 'light', heat: 'tritanopia' });
		expect(legacy.events.get(W2M)).toEqual({
			title: 'Sync',
			people: 5,
			openedAt: 1000,
			prefs: { roles: { 3: 'skip' }, duration: 90 },
			groups: [group]
		});
		expect(legacy.keys.sort()).toEqual(
			['ttm:theme', 'ttm:heat', 'ttm:recent', `ttm:event:${W2M}`, `ttm:groups:${W2M}`].sort()
		);
	});

	it('keeps setup for an event that was never on the recent list, as not recent', () => {
		const legacy = readLegacy(
			storage({ [`ttm:event:${OTHER}`]: JSON.stringify({ duration: 60 }) })
		);
		expect(legacy.events.get(OTHER)).toEqual({ prefs: { duration: 60 } });
		expect(legacy.events.get(OTHER)).not.toHaveProperty('openedAt');
	});

	it('reads v1’s link memory, below any real visit and without overriding the recent list', () => {
		const legacy = readLegacy(
			storage({
				linkMemory: JSON.stringify([
					{ title: 'Old poll', link: OTHER },
					{ title: 'Stale title', link: W2M }
				]),
				'ttm:recent': JSON.stringify([{ id: W2M, title: 'Sync', people: 2, openedAt: 5000 }])
			})
		);
		expect(legacy.events.get(OTHER)).toMatchObject({ title: 'Old poll', people: 0 });
		expect(legacy.events.get(OTHER)!.openedAt).toBeGreaterThan(0);
		expect(legacy.events.get(W2M)).toMatchObject({ title: 'Sync', openedAt: 5000 });
	});

	it('skips the demo, invalid IDs, and junk, and ignores keys that are not its own', () => {
		const legacy = readLegacy(
			storage({
				'ttm:recent': JSON.stringify([
					{ id: 'demo', title: 'Demo', people: 1, openedAt: 9 },
					{ id: 'a/b', title: 'Sneaky', people: 1, openedAt: 9 },
					{ id: W2M, title: '', people: 1, openedAt: 9 },
					{ id: OTHER, title: 'Never opened', people: 1, openedAt: 0 },
					null,
					'x'
				]),
				'ttm:event:demo': JSON.stringify({ duration: 60 }),
				'ttm:event:a/b': JSON.stringify({ duration: 60 }),
				[`ttm:event:${W2M}`]: '{not json',
				unrelated: 'keep me',
				'ttm:theme': 'neon'
			})
		);
		expect(legacy.events.size).toBe(0);
		expect(legacy.settings).toEqual({});
		expect(legacy.keys).not.toContain('unrelated');
		// Still listed for removal: they're ours, even when there was nothing worth keeping.
		expect(legacy.keys).toContain('ttm:recent');
	});

	it('is empty for empty storage', () => {
		expect(readLegacy(storage({}))).toEqual({ settings: {}, events: new Map(), keys: [] });
	});

	it('carries over at most MAX_LEGACY_EVENTS, keeping the newest', () => {
		const items: Record<string, string> = {};
		const recent = Array.from({ length: MAX_LEGACY_EVENTS + 10 }, (_, i) => ({
			id: `${i + 1}-abc`,
			title: `Event ${i}`,
			people: 1,
			openedAt: i + 1
		}));
		items['ttm:recent'] = JSON.stringify(recent);
		const legacy = readLegacy(storage(items));
		expect(legacy.events.size).toBe(MAX_LEGACY_EVENTS);
		expect(legacy.events.has(`${MAX_LEGACY_EVENTS + 10}-abc`)).toBe(true);
		expect(legacy.events.has('1-abc')).toBe(false);
	});
});

describe('onlyNew', () => {
	it('keeps what the account lacks and drops what it already has', () => {
		expect(
			onlyNew(
				{ prefs: { duration: 30 }, title: 'Mine' },
				{ prefs: { duration: 90 }, groups: [], title: 'Old' }
			)
		).toEqual({ groups: [] });
	});

	it('takes everything when there is nothing yet', () => {
		expect(onlyNew(null, { theme: 'light', heat: 'standard' })).toEqual({
			theme: 'light',
			heat: 'standard'
		});
	});

	it('is empty when the account has it all', () => {
		expect(onlyNew({ theme: 'dark' }, { theme: 'light' })).toEqual({});
	});
});
