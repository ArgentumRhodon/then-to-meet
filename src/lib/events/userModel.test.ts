import { describe, expect, it } from 'vitest';
import { forFirestore, readEventData, readPrefs, readRecent, readSettings } from './userModel';

describe('readSettings', () => {
	it('keeps a valid theme and palette', () => {
		expect(readSettings({ theme: 'light', heat: 'tritanopia' })).toEqual({
			theme: 'light',
			heat: 'tritanopia'
		});
	});

	it('drops anything else, and survives junk', () => {
		expect(readSettings({ theme: 'neon', heat: 3, extra: true })).toEqual({});
		expect(readSettings(null)).toEqual({});
		expect(readSettings('dark')).toEqual({});
		expect(readSettings(undefined)).toEqual({});
	});
});

describe('readPrefs', () => {
	it('round-trips a full setup', () => {
		const prefs = {
			roles: { 1: 'optional', 7: 'skip' },
			duration: 90,
			zone: 'Europe/Paris',
			group: 'g1',
			sharedGroup: 'Leads',
			seen: { 1: 'abc', 2: 'def' },
			perWeek: 3
		};
		expect(readPrefs(prefs)).toEqual(prefs);
	});

	it('reads roles keyed by text, as Firestore stores them', () => {
		expect(readPrefs({ roles: { '12': 'optional' } }).roles).toEqual({ 12: 'optional' });
	});

	it('drops invalid values field by field', () => {
		expect(
			readPrefs({
				roles: { 1: 'boss', x: 'skip', 2: 'skip' },
				duration: 'long',
				zone: '',
				group: 5,
				perWeek: 4,
				seen: { 1: 9, 2: 'ok' }
			})
		).toEqual({ roles: { 2: 'skip' }, seen: { 2: 'ok' } });
	});

	it('is empty for nothing usable', () => {
		expect(readPrefs(undefined)).toEqual({});
		expect(readPrefs([])).toEqual({});
	});
});

describe('readEventData', () => {
	const group = { id: 'g1', name: 'Leads', members: [1, 2], roles: { 2: 'optional' } };

	it('reads prefs, groups, and the recent-list fields', () => {
		expect(
			readEventData({
				title: 'Sync',
				people: 4,
				openedAt: 99,
				prefs: { duration: 60 },
				groups: [group]
			})
		).toEqual({ title: 'Sync', people: 4, openedAt: 99, prefs: { duration: 60 }, groups: [group] });
	});

	it('drops groups that are not usable', () => {
		const data = readEventData({
			groups: [group, { id: '', name: 'x', members: [] }, { id: 'a', name: 'b', members: ['1'] }, 7]
		});
		expect(data.groups).toEqual([group]);
	});

	it('only includes what was there', () => {
		expect(readEventData({ title: 'Sync' })).toEqual({ title: 'Sync' });
		expect(readEventData(null)).toEqual({});
	});
});

describe('readRecent', () => {
	it('makes a list entry from an event document', () => {
		expect(readRecent('abc', { title: 'Sync', people: 3, openedAt: 5 })).toEqual({
			id: 'abc',
			title: 'Sync',
			people: 3,
			openedAt: 5
		});
	});

	it('skips events taken off the list, or without a title', () => {
		expect(readRecent('abc', { title: 'Sync', openedAt: 0 })).toBeNull();
		expect(readRecent('abc', { prefs: { duration: 60 } })).toBeNull();
	});

	it('counts a missing headcount as zero', () => {
		expect(readRecent('abc', { title: 'Sync', openedAt: 5 })?.people).toBe(0);
	});
});

describe('forFirestore', () => {
	it('drops undefined values, which Firestore rejects', () => {
		expect(forFirestore({ a: 1, b: undefined, c: { d: undefined, e: 2 } })).toEqual({
			a: 1,
			c: { e: 2 }
		});
	});
});
